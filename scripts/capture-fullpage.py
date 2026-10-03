import subprocess
import os

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
output_dir = r"C:\PACHAX\docs\screenshots"

# Capturas de página completa (altura ampliada para capturar todas las secciones)
full_viewports = [
    {"name": "desktop-full-1440", "width": 1440, "height": 2200},
    {"name": "mobile-full-390", "width": 390, "height": 2400},
]

for vp in full_viewports:
    outfile = os.path.join(output_dir, f"{vp['name']}.png")
    cmd = [
        edge_path,
        "--headless=new",
        "--disable-gpu",
        f"--window-size={vp['width']},{vp['height']}",
        f"--screenshot={outfile}",
        "http://localhost:5173",
    ]
    subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(outfile):
        print(f"Captured {outfile} ({os.path.getsize(outfile)/1024:.1f} KB)")
