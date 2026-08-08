#!/usr/bin/env python3
"""
NVIDIA NIM / GLM Model & API Endpoint Verification Script
Usage:
    python scripts/test_glm.py [YOUR_NVIDIA_API_KEY]
"""

import sys
import os
import json
import urllib.request
import urllib.error
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def list_nvidia_models(api_key: str, base_url: str = "https://integrate.api.nvidia.com/v1"):
    print(f"\n==================================================")
    print(f"📋 Querying Available Models from NVIDIA NIM ({base_url})")
    print(f"==================================================")
    endpoint = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    req = urllib.request.Request(endpoint, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            models = [m.get('id') for m in data.get('data', [])]
            print(f"Found {len(models)} models on NVIDIA NIM:")
            for m in models[:20]:
                print(f"  - {m}")
            if len(models) > 20:
                print(f"  ... and {len(models) - 20} more.")
            return models
    except Exception as e:
        print(f"❌ Failed to fetch models list: {e}")
        return []

def test_nvidia_nim(api_key: str, base_url: str = "https://integrate.api.nvidia.com/v1", model: str = "glm-5.2"):
    print(f"\n==================================================")
    print(f"🚀 Testing NVIDIA NIM API Endpoint")
    print(f"📍 Base URL : {base_url}")
    print(f"🤖 Model    : {model}")
    print(f"🔑 Key      : {api_key[:8]}...{api_key[-4:] if len(api_key) > 12 else ''}")
    print(f"==================================================")

    endpoint = base_url.rstrip('/')
    if not endpoint.endswith('/chat/completions'):
        endpoint = f"{endpoint}/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": "Hello! Introduce yourself briefly."}
        ],
        "temperature": 0.4,
        "max_tokens": 128
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method="POST"
    )

    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            latency = round((time.time() - start_time) * 1000, 2)
            status_code = response.getcode()
            body_bytes = response.read()
            data = json.loads(body_bytes.decode('utf-8'))

            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')

            print(f"✅ STATUS {status_code} OK ({latency} ms)")
            print(f"💬 RESPONSE:\n{content}\n")
            return True

    except urllib.error.HTTPError as e:
        latency = round((time.time() - start_time) * 1000, 2)
        err_body = e.read().decode('utf-8', errors='ignore')
        print(f"❌ HTTP ERROR {e.code} ({latency} ms)")
        print(f"⚠️ Details: {err_body}\n")
        return False
    except Exception as e:
        print(f"❌ CONNECTION ERROR: {e}\n")
        return False

DEFAULT_API_KEY = "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"

def main():
    api_key = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("NVIDIA_API_KEY", DEFAULT_API_KEY)

    if not api_key:
        api_key = input("Enter your NVIDIA NIM API Key (starts with 'nvapi-'): ").strip()

    if not api_key:
        print("❌ Error: API key is required.")
        sys.exit(1)

    available_models = list_nvidia_models(api_key)

    models_to_test = [
        "glm-5.2",
        "thudm/glm-4-9b-chat",
        "deepseek-ai/deepseek-r1",
        "meta/llama-3.3-70b-instruct"
    ]

    # Add first 3 available models if list returned models
    if available_models:
        for m in available_models[:3]:
            if m not in models_to_test:
                models_to_test.append(m)

    print("\n🔍 Running test suite across NVIDIA NIM models...")
    successes = 0

    for model in models_to_test:
        if test_nvidia_nim(api_key=api_key, model=model):
            successes += 1

    print(f"🏁 Test finished: {successes}/{len(models_to_test)} models succeeded.")

if __name__ == "__main__":
    main()
