"""Read-only demo readiness. Does not download or load model weights."""
from pathlib import Path
import argparse
import ipaddress
import json
import socket
import ssl
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app import ai, stt  # noqa: E402
import httpx  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phone-ip')
    args = parser.parse_args()
    if args.phone_ip:
        ipaddress.ip_address(args.phone_ip)
    addresses = sorted({x[4][0] for x in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
    address = args.phone_ip or next((x for x in addresses if ipaddress.ip_address(x).is_private
                                   and not ipaddress.ip_address(x).is_loopback
                                   and not ipaddress.ip_address(x).is_link_local), None)
    checks = {}
    try:
        response = httpx.get(ai.OLLAMA_URL + '/api/tags', timeout=3, trust_env=False)
        response.raise_for_status()
        checks['ollama_model'] = ai.MODEL in {m['name'] for m in response.json()['models']}
    except Exception:
        checks['ollama_model'] = False
    checks['speech_weights_cached'] = stt.available()
    checks['face_model'] = (ROOT / 'knowledge/models/face_landmarker.task').is_file()
    checks['production_ui'] = (ROOT / 'frontend/dist/index.html').is_file()
    cert = ROOT / 'certs/gupai.pem'
    checks['https_key'] = (ROOT / 'certs/gupai-key.pem').is_file()
    try:
        details = ssl._ssl._test_decode_cert(str(cert))
        checks['https_certificate_valid'] = ssl.cert_time_to_seconds(details['notAfter']) > time.time()
        checks['phone_ip_in_certificate'] = bool(address and ('IP Address', address) in details.get('subjectAltName', []))
    except Exception:
        checks['https_certificate_valid'] = checks['phone_ip_in_certificate'] = False
    print(json.dumps({'model': ai.MODEL, 'phone_origin': f'https://{address}:8443' if address else None,
                      'checks': checks, 'ready': all(checks.values()),
                      'physical_check': 'Phone must trust the CA; camera/mic permissions require a real phone test.'}, indent=2))
    return 0 if all(checks.values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
