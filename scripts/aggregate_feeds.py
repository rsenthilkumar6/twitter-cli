#!/usr/bin/env python3
"""
Aggregate twitter-cli feeds into a local RAG-friendly store.
- Saves raw tweet JSON per id
- Appends a normalized JSONL index (one entry per line)
- Optionally downloads media and records local paths

Usage:
  scripts/aggregate_feeds.py            # run once
  scripts/aggregate_feeds.py --loop    # run continuously (default interval 300s)

This file is created by Hermes agent per user request. Do not paste the script in chat; it lives at the repo path.
"""

import os
import sys
import json
import time
import subprocess
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import shutil

# CONFIG
REPO = Path("/Users/rajamans/Work/dev/repos/forks/twitter-cli")
TWITTER_BIN = REPO / ".venv" / "bin" / "twitter"
if not TWITTER_BIN.exists():
    TWITTER_BIN = shutil.which("twitter") or "twitter"
OUTPUT_DIR = REPO / "data" / "feeds"
TWEETS_DIR = OUTPUT_DIR / "tweets"
MEDIA_DIR = OUTPUT_DIR / "media"
INDEX_PATH = OUTPUT_DIR / "index.jsonl"
SEEN_PATH = OUTPUT_DIR / "seen_ids.txt"
POLL_INTERVAL = 300
MAX_PER_FETCH = 50

FETCH_COMMANDS = [
    {"name": "for-you", "args": ["feed", "--max", str(MAX_PER_FETCH), "--json", "--full-text"]},
    {"name": "following", "args": ["feed", "-t", "following", "--max", str(MAX_PER_FETCH), "--json", "--full-text"]},
]

DOWNLOAD_MEDIA = True
DOWNLOAD_TIMEOUT = 30

# helpers

def run_twitter(args, timeout=60):
    if isinstance(TWITTER_BIN, (str, Path)):
        cmd = [str(TWITTER_BIN)] + args
    else:
        cmd = args
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise RuntimeError(f"twitter CLI not found at {TWITTER_BIN}. Ensure .venv exists or twitter is on PATH.")
    if proc.returncode != 0:
        raise RuntimeError(f"twitter command failed: {' '.join(cmd)}\nstdout:{proc.stdout}\nstderr:{proc.stderr}")
    return proc.stdout


def parse_json_output(text):
    text = (text or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except Exception:
        items = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                continue
        if items:
            return items
        raise
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("tweets", "data", "items", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
        return [data]
    return []


def find_urls(obj):
    urls = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and v.startswith("http"):
                urls.append(v)
            else:
                urls.extend(find_urls(v))
    elif isinstance(obj, list):
        for it in obj:
            urls.extend(find_urls(it))
    return urls


def best_get(d, keys, default=None):
    for k in keys:
        v = d.get(k) if isinstance(d, dict) else None
        if v is not None:
            return v
    return default


def get_id(tweet):
    for k in ("id", "id_str", "tweetId", "tweet_id", "pk"):
        v = tweet.get(k) if isinstance(tweet, dict) else None
        if v:
            return str(v)
    return str(abs(hash(json.dumps(tweet, sort_keys=True))) % (10 ** 12))


def extract_user(tweet):
    user = {}
    if not isinstance(tweet, dict):
        return user
    u = tweet.get("user") or tweet.get("author") or tweet.get("account") or tweet.get("author_info")
    if isinstance(u, dict):
        user["id"] = best_get(u, ("id", "id_str", "user_id"))
        user["username"] = best_get(u, ("username", "screen_name", "handle"))
        user["display_name"] = best_get(u, ("name", "display_name"))
        user["profile_image"] = best_get(u, ("profile_image_url", "avatar", "avatar_url"))
    else:
        user["id"] = best_get(tweet, ("user_id", "author_id"))
        user["username"] = best_get(tweet, ("username", "screen_name"))
    return user


def extract_metrics(tweet):
    m = {}
    if not isinstance(tweet, dict):
        return m
    m["likes"] = best_get(tweet, ("like_count", "likes", "favorites", "favorite_count"), 0)
    m["retweets"] = best_get(tweet, ("retweet_count", "retweets"), 0)
    m["replies"] = best_get(tweet, ("reply_count", "replies"), 0)
    m["bookmarks"] = best_get(tweet, ("bookmark_count", "bookmarks"), 0)
    m["views"] = best_get(tweet, ("views", "view_count", "impression_count"), None)
    return m


def extract_text(tweet):
    if not isinstance(tweet, dict):
        return ""
    for k in ("full_text", "text", "content", "body"):
        v = tweet.get(k)
        if isinstance(v, str):
            return v
    if "data" in tweet and isinstance(tweet["data"], dict):
        return extract_text(tweet["data"])
    return ""


def gather_media_entries(tweet):
    medias = []
    if not isinstance(tweet, dict):
        return medias
    candidates = []
    for k in ("media", "photos", "images", "attachments", "extended_entities", "media_entities"):
        v = tweet.get(k)
        if v:
            candidates.append((k, v))
    if candidates:
        for source, c in candidates:
            if isinstance(c, list):
                for it in c:
                    if isinstance(it, dict):
                        url = best_get(it, ("url", "media_url", "media_url_https", "preview_image_url", "display_url"))
                        if url:
                            medias.append({"type": it.get("type") or "unknown", "url": url, "source": source})
            elif isinstance(c, dict):
                url = best_get(c, ("url", "media_url", "media_url_https", "preview_image_url"))
                if url:
                    medias.append({"type": c.get("type") or "unknown", "url": url, "source": source})
    if not medias:
        urls = find_urls(tweet)
        for u in urls:
            p = urlparse(u)
            if any(p.path.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".m3u8")):
                medias.append({"type": "image" if u.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")) else "video", "url": u, "source": "found"})
    seen = set()
    unique = []
    for m in medias:
        if m["url"] not in seen:
            seen.add(m["url"])
            unique.append(m)
    return unique


def safe_filename(s):
    return "".join(c for c in s if c.isalnum() or c in "-_.").rstrip(".")


def download_media(url, dest_dir):
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        parsed = urlparse(url)
        name = os.path.basename(parsed.path) or parsed.netloc
        name = safe_filename(name)
        out = dest_dir / f"{name}"
        req = Request(url, headers={"User-Agent": "twitter-cli-rag-agent/1.0"})
        with urlopen(req, timeout=DOWNLOAD_TIMEOUT) as resp:
            data = resp.read()
        with open(out, "wb") as f:
            f.write(data)
        return str(out)
    except Exception:
        return None


def extract_hashtags(text):
    if not text: return []
    import re
    return list(set(re.findall(r"#(\w+)", text)))


def extract_mentions(text):
    if not text: return []
    import re
    return list(set(re.findall(r"@(\w+)", text)))


def extract_urls(raw):
    urls = []
    if not isinstance(raw, dict): return urls
    # Check entities if available
    entities = raw.get("entities", {})
    if "urls" in entities:
        for u in entities["urls"]:
            expanded = u.get("expanded_url") or u.get("url")
            if expanded: urls.append(expanded)
    # Fallback to finding in text if needed, but run_twitter usually gives us urls list in raw
    if "urls" in raw and isinstance(raw["urls"], list):
        urls.extend(raw["urls"])
    return list(set(urls))


def normalize_tweet(raw, source_cmd_name):
    tid = get_id(raw)
    user = extract_user(raw)
    text = extract_text(raw)
    created_at = raw.get("createdAtISO") or raw.get("created_at") or raw.get("created_at_ts") or raw.get("time")
    
    hashtags = extract_hashtags(text)
    mentions = extract_mentions(text)
    urls = extract_urls(raw)
    metrics = extract_metrics(raw)
    
    # Threading/Conversation context
    reply_to_id = raw.get("inReplyToStatusId") or raw.get("in_reply_to_status_id")
    reply_to_user = raw.get("inReplyToScreenName") or raw.get("in_reply_to_screen_name")
    
    # Create RAG-optimized content string
    author_info = f"Author: @{user.get('username')} ({user.get('display_name')})"
    date_info = f"Date: {created_at}"
    thread_info = f"Reply to: @{reply_to_user} (Tweet ID: {reply_to_id})" if reply_to_id else "Thread: Original/Root"
    content_info = f"Content: {text}"
    meta_info = f"Hashtags: {', '.join(hashtags)}" if hashtags else ""
    
    rag_parts = [author_info, date_info, thread_info, content_info]
    if meta_info: rag_parts.append(meta_info)
    rag_content = "\n".join(rag_parts)

    return {
        "id": tid,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "source": source_cmd_name,
        "text": text,
        "rag_content": rag_content,
        "created_at": created_at,
        "user": user,
        "metrics": metrics,
        "metadata": {
            "hashtags": hashtags,
            "mentions": mentions,
            "urls": urls,
            "metrics": metrics,
            "is_reply": bool(reply_to_id),
            "reply_to_id": reply_to_id,
            "reply_to_user": reply_to_user,
            "lang": raw.get("lang"),
        },
        "media": gather_media_entries(raw),
        "raw": raw,
    }


def load_seen_ids():
    if not SEEN_PATH.exists():
        return set()
    return set(l.strip() for l in SEEN_PATH.read_text().splitlines() if l.strip())


def save_seen_id(tid):
    SEEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SEEN_PATH, "a") as f:
        f.write(tid + "\n")


def append_index(entry):
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(INDEX_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def save_raw_tweet(tid, raw):
    TWEETS_DIR.mkdir(parents=True, exist_ok=True)
    path = TWEETS_DIR / f"{tid}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)
    return str(path)


def fetch_and_store(cmd, seen):
    try:
        out = run_twitter(cmd["args"], timeout=120)
    except Exception as e:
        print(f"[ERROR] fetching {cmd['name']}: {e}", file=sys.stderr)
        return 0
    items = parse_json_output(out)
    new_count = 0
    for raw in items:
        try:
            tid = get_id(raw)
        except Exception:
            continue
        if tid in seen:
            continue
        norm = normalize_tweet(raw, cmd["name"])
        if DOWNLOAD_MEDIA and norm["media"]:
            for m in norm["media"]:
                url = m.get("url")
                if not url:
                    continue
                local = download_media(url, MEDIA_DIR / tid)
                if local:
                    m["local_path"] = local
        raw_path = save_raw_tweet(norm["id"], raw)
        norm["raw_path"] = raw_path
        append_index(norm)
        save_seen_id(norm["id"])
        seen.add(norm["id"])
        new_count += 1
    return new_count


def run_once():
    seen = load_seen_ids()
    total_new = 0
    for cmd in FETCH_COMMANDS:
        try:
            n = fetch_and_store(cmd, seen)
            print(f"[{datetime.utcnow().isoformat()}] {cmd['name']}: {n} new tweets")
            total_new += n
        except Exception as e:
            print(f"[ERROR] {cmd['name']}: {e}", file=sys.stderr)
    print(f"[{datetime.utcnow().isoformat()}] total new: {total_new}")
    return total_new


def main():
    import argparse
    p = argparse.ArgumentParser(description="Aggregate twitter-cli feeds for local RAG store")
    p.add_argument("--loop", action="store_true", help="Run forever with POLL_INTERVAL sleeps")
    p.add_argument("--interval", type=int, default=POLL_INTERVAL, help="Poll interval seconds when --loop")
    p.add_argument("--no-media", action="store_true", help="Do not download media")
    p.add_argument("--max", type=int, help="Override MAX_PER_FETCH")
    args = p.parse_args()
    global DOWNLOAD_MEDIA, MAX_PER_FETCH
    if args.no_media:
        DOWNLOAD_MEDIA = False
    if args.max:
        MAX_PER_FETCH = args.max
        for c in FETCH_COMMANDS:
            for i, a in enumerate(c["args"]):
                if a == "--max" and i + 1 < len(c["args"]):
                    c["args"][i + 1] = str(MAX_PER_FETCH)
    if args.loop:
        print(f"Starting loop; poll interval={args.interval}s")
        try:
            while True:
                run_once()
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("Stopping loop")
    else:
        run_once()


if __name__ == "__main__":
    main()
