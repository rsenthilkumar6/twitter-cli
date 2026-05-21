Twitter Offline Dashboard

To run:

1) Ensure you have data in data/feeds/index.jsonl and media/ directory populated by the aggregator.
2) From the repo root run:

   ./scripts/run_dashboard.sh

3) Open http://localhost:8000/web_dashboard/ in your browser.

Notes:
- The dashboard is a single-page app using vanilla JS. It fetches ../data/feeds/index.jsonl relative to the web_dashboard/ directory — ensure you serve the repo root (scripts/run_dashboard.sh does this).
- If index.jsonl is missing, the page shows an error message.
