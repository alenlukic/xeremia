"""Start the dj-tools API server.

Run:
    python -m src.scripts.run_api
"""

import os

import uvicorn


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", "8001"))
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=port, reload=True)
