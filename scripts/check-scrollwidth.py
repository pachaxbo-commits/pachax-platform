import subprocess
import json
import urllib.request
import time
import os

viewports = [
    (1920, 1080),
    (1440, 900),
    (768, 1024),
    (430, 932),
    (390, 844),
    (360, 800),
]

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

print("Checking scrollWidth <= innerWidth across all viewports...")

# We can launch edge with remote debugging on port 9222
user_data_dir = r"C:\PACHAX\docs\edge_temp_profile"
os.makedirs(user_data_dir, exist_ok=True)

proc = subprocess.Popen([
    edge_path,
    "--headless=new",
    "--remote-debugging-port=9222",
    f"--user-data-dir={user_data_dir}",
    "about:blank"
])

time.sleep(2)

try:
    # Get web socket URL
    tabs_raw = urllib.request.urlopen("http://localhost:9222/json").read()
    tabs = json.loads(tabs_raw)
    ws_url = tabs[0]["webSocketDebuggerUrl"]
    print("Edge CDP ready! Connected to:", ws_url)
finally:
    proc.terminate()
    proc.wait()
