import subprocess
import os
import time

viewports = [
    {"name": "desktop-1920x1080", "width": 1920, "height": 1080},
    {"name": "desktop-1440x900", "width": 1440, "height": 900},
    {"name": "tablet-768x1024", "width": 768, "height": 1024},
    {"name": "mobile-430x932", "width": 430, "height": 932},
    {"name": "mobile-390x844", "width": 390, "height": 844},
    {"name": "mobile-360x800", "width": 360, "height": 800},
]

output_dir = r"C:\PACHAX\docs\screenshots"
os.makedirs(output_dir, exist_ok=True)

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

print("Starting screenshot captures...")
for vp in viewports:
    outfile = os.path.join(output_dir, f"{vp['name']}.png")
    cmd = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        f"--window-size={vp['width']},{vp['height']}",
        f"--screenshot={outfile}",
        "http://localhost:5173",
    ]
    print(f"Capturing {vp['name']} ({vp['width']}x{vp['height']})...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(outfile):
        size_kb = os.path.getsize(outfile) / 1024
        print(f" -> SUCCESS: {outfile} ({size_kb:.1f} KB)")
    else:
        print(f" -> FAILED to generate {outfile}. Return code: {res.returncode}")

print("\nAll captures completed!")
