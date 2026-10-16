import urllib.request
import json

key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZml0ZWtvdHBneWRpb2xjeXJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDI2NzkxOSwiZXhwIjoyMTA1ODQzOTE5fQ.i88mNjIu2pXEO63wuMzINWiEQ_zRsq6CXuo3613X5hM'
url = 'https://ygfitekotpgydiolcyry.supabase.co/rest/v1/crm_boards?user_id=eq.ed3fbc90-dd78-4d3c-9684-13c8504a1c14&select=id,user_id,data_payload'
req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': f'Bearer {key}'})

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    for b in data:
        payload = b.get('data_payload', {})
        phases = payload.get('phases', [])
        print("Board ID:", b.get("id"), "phases count:", len(phases))
        for p in phases:
            cls = p.get('clients', [])
            print("  Phase:", p.get("title"), "(", p.get("id"), ") - clients:", len(cls))
            for c in cls:
                print("    Client:", c.get("name"), "id:", c.get("id"), "dealClosed:", c.get("dealClosed"), "dealClosedDate:", c.get("dealClosedDate"), "desiredCredit:", c.get("desiredCredit"), "contracts:", c.get("contracts"))
