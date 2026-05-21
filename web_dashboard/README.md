# TwitArchive Dashboard

Offline dashboard for browsing archived Twitter/X feed data, styled to replicate the X client UI.

## Features

- X-style dark theme with Tailwind CSS
- Three-column layout (sidebar, feed, stats panel)
- Profile images from Twitter CDN
- Media thumbnails (photos, videos)
- Search filtering across tweets
- Pagination (20 per page)
- Archive stats and trending hashtags

## Usage

```bash
# From the repository root:
./scripts/run_dashboard.sh
```

Then open http://localhost:8000/web_dashboard/

## Manual alternative

```bash
python3 -m http.server 8000
open http://localhost:8000/web_dashboard/
```
