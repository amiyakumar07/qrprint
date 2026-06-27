"""
QRPrint - Windows Print Agent
Run this on the PC connected to the printer.
pip install requests
"""

import requests
import time
import subprocess
import os
import tempfile

SERVER_URL = "http://localhost:3000"  # Change to your server URL
SHOP_ID = "SHOP_xxxxxx"               # Set your Shop ID
AGENT_TOKEN = "secret_agent_token_123" # Set your agent token
POLL_INTERVAL = 8  # seconds

def print_file(filepath, pages):
    """Print using SumatraPDF (Windows)"""
    sumatra = r"C:\Program Files\SumatraPDF\SumatraPDF.exe"
    if not os.path.exists(sumatra):
        sumatra = r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe"
    
    if os.path.exists(sumatra):
        cmd = [sumatra, "-print-to-default", "-silent", filepath]
    else:
        # Fallback: use Windows built-in print
        cmd = ["rundll32", "mshtml.dll,PrintHTML", filepath]
    
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0

def poll_and_print():
    while True:
        try:
            r = requests.get(
                f"{SERVER_URL}/api/agent/jobs/{SHOP_ID}",
                params={"token": AGENT_TOKEN},
                timeout=10
            )
            jobs = r.json().get("jobs", [])
            
            for job in jobs:
                job_id = job["job_id"]
                print(f"[+] New job: {job_id}")
                
                # Download file
                dl = requests.get(
                    f"{SERVER_URL}/api/agent/download/{job_id}",
                    params={"token": AGENT_TOKEN},
                    timeout=30
                )
                
                ext = os.path.splitext(job["filename"])[1] or ".pdf"
                tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                tmp.write(dl.content)
                tmp.close()
                
                # Print
                success = print_file(tmp.name, job.get("pages", 1))
                os.unlink(tmp.name)
                
                # Report back
                requests.post(f"{SERVER_URL}/api/agent/job-done", json={
                    "job_id": job_id,
                    "status": "done" if success else "failed",
                    "token": AGENT_TOKEN
                }, timeout=10)
                
                print(f"[{'✓' if success else '✗'}] Job {job_id}: {'done' if success else 'failed'}")
        
        except Exception as e:
            print(f"[!] Error: {e}")
        
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    print("QRPrint Agent started...")
    print(f"Shop: {SHOP_ID} | Server: {SERVER_URL}")
    poll_and_print()
