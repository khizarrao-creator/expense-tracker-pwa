import { getTransactions, getAccounts, getSummaryByAccount } from '../src/db/queries';

async function diagnose() {
  try {
    const trxs = await getTransactions(5);
    const summary = await getSummaryByAccount();
    console.log('Recent Transactions:', JSON.stringify(trxs, null, 2));
    console.log('Account Summary:', JSON.stringify(summary, null, 2));
  } catch (e) {
    console.error('Diagnosis failed:', e);
  }
}

diagnose();
