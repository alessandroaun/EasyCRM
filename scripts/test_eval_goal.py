import urllib.request
import json
from datetime import datetime, timezone

key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZml0ZWtvdHBneWRpb2xjeXJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDI2NzkxOSwiZXhwIjoyMTA1ODQzOTE5fQ.i88mNjIu2pXEO63wuMzINWiEQ_zRsq6CXuo3613X5hM'
headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}

def parse_money(val):
    if not val:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace('R$', '').replace(' ', '')
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif '.' in s:
        parts = s.split('.')
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
            s = ''.join(parts)
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except:
        return 0.0

def get_client_credit(c):
    contracts = c.get('contracts') or []
    if isinstance(contracts, list) and len(contracts) > 0:
        total = sum(parse_money(ct.get('valorContrato') or ct.get('credito') or ct.get('creditValue')) for ct in contracts)
        if total > 0:
            return total
    return parse_money(c.get('desiredCredit') or c.get('creditValue') or c.get('credit') or c.get('valor'))

# 1. Fetch pending goals
url_goals = 'https://ygfitekotpgydiolcyry.supabase.co/rest/v1/crm_acoes_vendas?status=eq.pendente&select=*'
req = urllib.request.Request(url_goals, headers=headers)
with urllib.request.urlopen(req) as resp:
    goals = json.loads(resp.read().decode())
print(f"Pending goals found: {len(goals)}")

# 2. For each goal, test evaluation
for g in goals:
    print(f"\nEvaluating Goal {g['id']} for seller {g['target_user_id']}:")
    print(f"  Target: {g['tipo_meta']} {g['valor_meta']}, created_at={g['created_at']}, deadline={g['data_limite']}")
    
    url_board = f"https://ygfitekotpgydiolcyry.supabase.co/rest/v1/crm_boards?user_id=eq.{g['target_user_id']}&select=id,data_payload"
    req_b = urllib.request.Request(url_board, headers=headers)
    with urllib.request.urlopen(req_b) as resp_b:
        boards = json.loads(resp_b.read().decode())
    
    closed_clients = []
    for b in boards:
        payload = b.get('data_payload') or {}
        for p in payload.get('phases') or []:
            is_closed_phase = any(x in (p.get('title') or '').lower() for x in ['fechad', 'ganh', 'concluid'])
            for c in p.get('clients') or []:
                if c.get('dealClosed') or is_closed_phase:
                    closed_clients.append(c)
    
    print(f"  Closed clients in seller boards: {len(closed_clients)}")
    
    created_at = datetime.fromisoformat(g['created_at'].replace('Z', '+00:00'))
    deadline = datetime.fromisoformat(g['data_limite'].replace('Z', '+00:00'))
    
    valid_deals = []
    for c in closed_clients:
        deal_date_str = c.get('dealClosedDate') or c.get('updatedAt') or c.get('createdAt')
        if not deal_date_str:
            continue
        deal_date = datetime.fromisoformat(deal_date_str.replace('Z', '+00:00'))
        if created_at <= deal_date <= deadline:
            valid_deals.append(c)
            cred = get_client_credit(c)
            print(f"  -> Valid Deal: {c.get('name')} | date={deal_date_str} | credit={cred}")
    
    total_cred = sum(get_client_credit(c) for c in valid_deals)
    print(f"  Total Valid Credit: {total_cred} (Goal: {g['valor_meta']})")
    is_fulfilled = total_cred >= float(g['valor_meta'])
    print(f"  Fulfilled?: {is_fulfilled}")
