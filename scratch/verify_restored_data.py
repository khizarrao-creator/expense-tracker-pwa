import urllib.request
import json
import os
import dotenv
from pathlib import Path

dotenv.load_dotenv(r"d:\expenseTracker\.env")

url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

print(f"Supabase URL: {url}")
if url and key:
    req = urllib.request.Request(
        f"{url}/rest/v1/grid_sheets?select=*",
        headers={"apikey": key, "Authorization": f"Bearer {key}"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            print(f"Total grid_sheets in Supabase: {len(data)}")
            for item in data:
                rows = item.get("rows", [])
                print(f"  - Sheet ID: {item.get('id')}, Name: '{item.get('sheet_name')}', Project ID: {item.get('project_id')}, Rows: {len(rows)}")
    except Exception as e:
        print(f"Error querying Supabase: {e}")
