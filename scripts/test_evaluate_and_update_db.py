import urllib.request
import json
from datetime import datetime

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

# Run evaluation for the goal
url_goal = 'https://ygfitekotpgydiolcyry.supabase.co/rest/v1/crm_acoes_vendas?id=eq.57ffd6db-2f8a-4002-81cd-f5435a1b3117&select=*'
req = urllib.request.Request(url_goal, headers=headers)
with urllib.request.urlopen(req) as resp:
    goal = json.loads(resp.read().decode())[0]

print("Goal state before:", goal['status'], "progresso:", goal['progresso_atual'])

url_board = f"https://ygfitekotpgydiolcyry.supabase.co/rest/v1/crm_boards?user_id=eq.{goal['target_user_id']}&select=id,data_payload"
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

created_at = datetime.fromisoformat(goal['created_at'].replace('Z', '+00:00'))
deadline = datetime.fromisoformat(goal['data_limite'].replace('Z', '+00:00'))

valid_deals = []
for c in closed_clients:
    deal_date_str = c.get('dealClosedDate') or c.get('updatedAt') or c.get('createdAt')
    if not deal_date_str:
        continue
    deal_date = datetime.fromisoformat(deal_date_str.replace('Z', '+00:00'))
    if created_at <= deal_date <= deadline:
        valid_deals.append(c)

total_cred = sum(get_client_credit(c) for c in valid_deals)
print(f"Total credit calculated: R$ {total_cred:,.2f}")

if total_cred >= float(goal['valor_meta']):
    now_iso = datetime.now().astimezone().isoformat()
    # Update Supabase
    update_data = json.dumps({
        'status': 'cumprido',
        'progresso_atual': total_cred,
        'cumprido_em': now_iso
    }).encode()
    patch_req = urllib.request.Request(
        f"https://ygfitekotpgydiolcyry.supabase.co/rest/v1/crm_acoes_vendas?id=eq.{goal['id']}",
        data=update_data,
        headers=headers,
        method='PATCH'
    )
    with urllib.request.urlopen(patch_req) as patch_resp:
        print("PATCH crm_acoes_vendas status:", patch_resp.status)
    
    # Trigger Web Push via Cloud Run
    push_payload = json.dumps({
        'creator_id': goal['creator_id'],
        'vendedor_name': 'Alessandro Uchoa',
        'tipo_meta': goal['tipo_meta'],
        'valor_meta': goal['valor_meta'],
        'bonificacao': goal['bonificacao']
    }).encode()
    push_req = urllib.request.Request(
        'https://backend-crm-cloudrun-181756920426.southamerica-east1.run.app/api/acoes-vendas/notificar-cumprimento',
        data=push_payload,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(push_req) as push_resp:
        print("Push sent! Response:", push_resp.read().decode())
