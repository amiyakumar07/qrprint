import requests, subprocess, time, os, sys, json
from pathlib import Path

CONFIG_FILE = "config.json"
POLL_INTERVAL = 5

def load_config():
    if not os.path.exists(CONFIG_FILE):
        default_cfg = {
            "serverUrl": "http://localhost:3000",
            "shopId": "PE-1000",
            "sumatraPath": r"C:\Program Files\SumatraPDF\SumatraPDF.exe"
        }
        with open(CONFIG_FILE, "w") as f:
            json.dump(default_cfg, f, indent=2)
        return default_cfg

    with open(CONFIG_FILE) as f:
        return json.load(f)

def poll_and_print():
    cfg = load_config()
    server = cfg.get("serverUrl", "http://localhost:3000")
    shop_id = cfg.get("shopId", "")
    sumatra = cfg.get("sumatraPath", r"C:\Program Files\SumatraPDF\SumatraPDF.exe")
    queue = Path("./queue")
    queue.mkdir(exist_ok=True)

    if not shop_id:
        print("[!] Shop ID not set in config.json")
        return

    try:
        r = requests.get(f"{server}/api/agent/jobs/{shop_id}", timeout=8)
        jobs = r.json().get("jobs", [])
        for job in jobs:
            jid = job["_id"]
            fname = job["fileName"]
            path = queue / fname

            print(f"[+] Downloading job: {job.get('originalName', fname)}")
            dl = requests.get(f"{server}/api/agent/download/{jid}", stream=True, timeout=30)
            with open(path, "wb") as f:
                for chunk in dl.iter_content(8192):
                    f.write(chunk)

            # Print via SumatraPDF or built-in fallback
            if os.path.exists(sumatra):
                subprocess.run([sumatra, "-print-to-default", "-silent", str(path)], check=True)
            else:
                subprocess.run(["rundll32", "mshtml.dll,PrintHTML", str(path)])

            # Mark done
            requests.post(f"{server}/api/agent/done/{jid}", timeout=8)
            try:
                os.remove(path)
            except Exception:
                pass
            print(f"[✓ PRINTED] {fname}")
    except Exception as e:
        print(f"[!] Error: {e}")

if __name__ == "__main__":
    print("==================================================")
    print(" PrintEase Wireless Print Agent Started ")
    print(" Press Ctrl+C to stop ")
    print("==================================================")
    while True:
        poll_and_print()
        time.sleep(POLL_INTERVAL)
