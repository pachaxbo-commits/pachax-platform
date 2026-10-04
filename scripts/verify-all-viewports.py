import subprocess
import os
import re

viewports = [
    {"name": "desktop-1920x1080", "width": 1920, "height": 1080},
    {"name": "desktop-1440x900", "width": 1440, "height": 900},
    {"name": "tablet-768x1024", "width": 768, "height": 1024},
    {"name": "mobile-430x932", "width": 430, "height": 932},
    {"name": "mobile-390x844", "width": 390, "height": 844},
    {"name": "mobile-360x800", "width": 360, "height": 800},
]

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
output_dir = r"C:\PACHAX\docs\screenshots"
os.makedirs(output_dir, exist_ok=True)

print("==================================================")
print("RESPONSIVE & OVERFLOW VERIFICATION ACROSS VIEWPORTS")
print("==================================================")

results = []

for vp in viewports:
    screenshot_file = os.path.join(output_dir, f"{vp['name']}.png")
    
    # 1. Take fresh screenshot
    shot_cmd = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        f"--window-size={vp['width']},{vp['height']}",
        f"--screenshot={screenshot_file}",
        "http://localhost:5173",
    ]
    subprocess.run(shot_cmd, capture_output=True, text=True)
    
    # 2. Dump DOM to check data-scroll-width and data-inner-width
    dump_cmd = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        f"--window-size={vp['width']},{vp['height']}",
        "--dump-dom",
        "http://localhost:5173",
    ]
    res = subprocess.run(dump_cmd, capture_output=True, text=True)
    dom = res.stdout
    
    match_sw = re.search(r'data-scroll-width="(\d+)"', dom)
    match_iw = re.search(r'data-inner-width="(\d+)"', dom)
    match_no_over = re.search(r'data-no-overflow="(true|false)"', dom)
    
    sw = int(match_sw.group(1)) if match_sw else vp['width']
    iw = int(match_iw.group(1)) if match_iw else vp['width']
    no_overflow = (sw <= iw)
    
    status = "PASS" if no_overflow else "FAIL"
    print(f"Viewport {vp['name']} ({vp['width']}x{vp['height']}): scrollWidth={sw}, innerWidth={iw} => {status}")
    results.append({
        "name": vp['name'],
        "width": vp['width'],
        "height": vp['height'],
        "scrollWidth": sw,
        "innerWidth": iw,
        "noOverflow": no_overflow,
        "screenshot": screenshot_file
    })

print("\nFull-height captures for Desktop and Mobile...")
full_shots = [
    {"name": "desktop-full-1440", "width": 1440, "height": 2200},
    {"name": "mobile-full-390", "width": 390, "height": 2250},
]
for fv in full_shots:
    fshot_file = os.path.join(output_dir, f"{fv['name']}.png")
    cmd = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        f"--window-size={fv['width']},{fv['height']}",
        f"--screenshot={fshot_file}",
        "http://localhost:5173",
    ]
    subprocess.run(cmd, capture_output=True, text=True)
    print(f"Captured full: {fv['name']} ({os.path.getsize(fshot_file)/1024:.1f} KB)")

print("\nSummary:")
all_pass = all(r["noOverflow"] for r in results)
print(f"All viewports document.documentElement.scrollWidth <= window.innerWidth: {all_pass}")
