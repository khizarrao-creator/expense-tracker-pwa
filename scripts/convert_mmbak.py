#!/usr/bin/env python3
"""
convert_mmbak.py

Converts Money Manager SQLite backup (.mmbak) into workspace-standard JSON format
suitable for importing into Firestore and Supabase via UserMigrationSyncManager.
"""

import os
import sys
import sqlite3
import json
from datetime import datetime, timezone

def convert_mmbak(sqlite_path: str, output_path: str, user_email: str = 'ranaibrahemwork@gmail.com'):
    if not os.path.exists(sqlite_path):
        print(f"Error: File not found at {sqlite_path}")
        sys.exit(1)

    print(f"Connecting to Money Manager backup: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Extract Accounts (ZASSET)
    cursor.execute("SELECT * FROM ZASSET WHERE ZISDEL=0")
    asset_rows = cursor.fetchall()
    accounts = []
    asset_map = {}

    for a in asset_rows:
        uid = str(a['ZUID'])
        name = a['ZNICNAME'] or f"Account {uid}"
        asset_map[uid] = name
        currency = 'PKR'
        if a['ZCURRENCYUID']:
            currency = a['ZCURRENCYUID'].split('_')[0]
        
        acc_type = 'cash' if 'cash' in name.lower() else ('credit' if 'card' in name.lower() else 'bank')

        accounts.append({
            'id': f"acc_mm_{uid}",
            'name': name,
            'type': acc_type,
            'initial_balance': 0,
            'currency': currency,
            'color': '#3B82F6',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        })

    # 2. Extract Categories (ZCATEGORY)
    cursor.execute("SELECT * FROM ZCATEGORY WHERE ZISDEL=0")
    cat_rows = cursor.fetchall()
    cat_by_uid = {str(c['ZUID']): dict(c) for c in cat_rows}

    categories = []
    for cid, c in cat_by_uid.items():
        c_type = 'income' if c['ZDOTYPE'] == 0 else 'expense'
        zpuid = str(c['ZPUID'] or '0')
        parent_id = f"cat_mm_{zpuid}" if zpuid != '0' and zpuid in cat_by_uid else None

        categories.append({
            'id': f"cat_mm_{cid}",
            'name': c['ZNAME'],
            'type': c_type,
            'icon': 'Folder',
            'parent_id': parent_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        })

    # 3. Extract Transactions (ZINOUTCOME)
    cursor.execute("SELECT * FROM ZINOUTCOME WHERE ZISDEL=0")
    tx_rows = cursor.fetchall()

    transactions = []
    for t in tx_rows:
        do_type = str(t['ZDO_TYPE'])
        if do_type == '4':
            # Skip transfer-in duplicate row (pair handled by type 3)
            continue

        tx_id = f"tx_mm_{t['Z_PK']}"
        date_str = t['ZTXDATESTR']
        if t['ZDATE']:
            try:
                dt = datetime.fromtimestamp(978307200 + t['ZDATE'], tz=timezone.utc)
                date_str = dt.strftime('%Y-%m-%d')
            except Exception:
                pass

        cat_uid = str(t['ZCATEGORYUID']) if t['ZCATEGORYUID'] else None
        cat_name = 'Uncategorized'
        subcat_name = None

        if cat_uid and cat_uid in cat_by_uid:
            cobj = cat_by_uid[cat_uid]
            zpuid = str(cobj['ZPUID'] or '0')
            if zpuid != '0' and zpuid in cat_by_uid:
                cat_name = cat_by_uid[zpuid]['ZNAME']
                subcat_name = cobj['ZNAME']
            else:
                cat_name = cobj['ZNAME']

        desc_parts = []
        if t['ZCONTENT']: desc_parts.append(str(t['ZCONTENT']))
        if t['ZMEMO']: desc_parts.append(str(t['ZMEMO']))
        description = ' - '.join(desc_parts)

        acc_id = f"acc_mm_{t['ZASSETUID']}" if t['ZASSETUID'] else None
        to_acc_id = f"acc_mm_{t['ZTOASSETUID']}" if t['ZTOASSETUID'] else None

        if do_type == '0':
            tx_type = 'income'
        elif do_type == '1':
            tx_type = 'expense'
        elif do_type == '3':
            tx_type = 'transfer'
            cat_name = 'Transfer'
        else:
            tx_type = 'expense'

        transactions.append({
            'id': tx_id,
            'type': tx_type,
            'amount': float(t['ZAMOUNT'] or 0),
            'category': cat_name,
            'subcategory': subcat_name,
            'description': description,
            'date': date_str,
            'payment_method': asset_map.get(str(t['ZASSETUID']), ''),
            'account_id': acc_id,
            'to_account_id': to_acc_id if tx_type == 'transfer' else None,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        })

    full_export = {
        'app': 'The Base Workspace Suite',
        'version': '1.0',
        'exportedAt': datetime.now(timezone.utc).isoformat(),
        'userEmail': user_email,
        'collections': {
            'accounts': accounts,
            'categories': categories,
            'transactions': transactions
        }
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(full_export, f, indent=2, ensure_ascii=False)

    print(f"✅ Conversion complete!")
    print(f"Output saved to: {output_path}")
    print(f"Accounts: {len(accounts)}")
    print(f"Categories: {len(categories)}")
    print(f"Transactions: {len(transactions)}")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sqlite_file = os.path.join(base_dir, 'backups', 'Custom', 'ranadata.mmbak')
    output_file = os.path.join(base_dir, 'backups', 'Custom', 'ranadata_converted.json')
    convert_mmbak(sqlite_file, output_file)
