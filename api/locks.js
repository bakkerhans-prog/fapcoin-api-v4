{
"name": "fapcoin-api",
"version": "1.0.0",
"description": "API for fetching FAPCOIN locked and free tokens",
"main": "index.js",
"scripts": {
"start": "vercel dev"
},
"dependencies": {
"@solana/web3.js": "^1.81.0",
"@solana/buffer-layout": "^6.0.1"
}
}

// api/locks.js

import { Connection, PublicKey } from "@solana/web3.js";
import * as BufferLayout from "@solana/buffer-layout";

const JUPITER_LOCK_PROGRAM_ID = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");
const FAPCOIN_MINT = new PublicKey("8vGr1eX9vfpootWiUPYa5kYoGx9bTuRy2Xc4dNMrpump");

const PUBLIC_KEY_LAYOUT = (property) => BufferLayout.blob(32, property);

const VestingEscrowLayout = BufferLayout.struct([
PUBLIC_KEY_LAYOUT("recipient"),
PUBLIC_KEY_LAYOUT("token_mint"),
PUBLIC_KEY_LAYOUT("creator"),
PUBLIC_KEY_LAYOUT("base"),
BufferLayout.u8("escrow_bump"),
BufferLayout.u8("update_recipient_mode"),
BufferLayout.u8("cancel_mode"),
BufferLayout.u8("token_program_flag"),
BufferLayout.blob(4, "padding_0"),
BufferLayout.nu64("cliff_time"),
BufferLayout.nu64("frequency"),
BufferLayout.nu64("cliff_unlock_amount"),
BufferLayout.nu64("amount_per_period"),
BufferLayout.nu64("number_of_period"),
BufferLayout.nu64("total_claimed_amount"),
BufferLayout.nu64("vesting_start_time"),
BufferLayout.nu64("cancelled_at"),
BufferLayout.nu64("padding_1"),
BufferLayout.blob(16 * 5, "buffer")
]);

const connection = new Connection("[https://rpc.ankr.com/solana](https://rpc.ankr.com/solana)", "confirmed");

export default async function handler(req, res) {
try {
const accounts = await connection.getProgramAccounts(JUPITER_LOCK_PROGRAM_ID);

```
const holders = {};

for (const acc of accounts) {
  const data = Buffer.from(acc.account.data);
  if (data.length < 288) continue;
  const escrow = VestingEscrowLayout.decode(data);
  const mint = new PublicKey(escrow.token_mint);
  if (!mint.equals(FAPCOIN_MINT)) continue;

  const recipient = new PublicKey(escrow.recipient).toString();
  const totalVesting = Number(escrow.cliff_unlock_amount) + Number(escrow.amount_per_period) * Number(escrow.number_of_period);
  const locked = totalVesting - Number(escrow.total_claimed_amount);

  if (!holders[recipient]) holders[recipient] = { locked: 0 };
  holders[recipient].locked += locked;
}

const recipientAddresses = Object.keys(holders);
for (const addr of recipientAddresses) {
  const balanceInfo = await connection.getTokenAccountsByOwner(new PublicKey(addr), { mint: FAPCOIN_MINT });
  let free = 0;
  for (const tokenAcc of balanceInfo.value) {
    free += Number(tokenAcc.account.data.readBigUInt64LE(64));
  }
  holders[addr].free = free;
  holders[addr].total = free + holders[addr].locked;
}

const result = Object.entries(holders).map(([recipient, { free, locked, total }]) => ({
  recipient,
  free,
  locked,
  total
}));

res.status(200).json({ token: FAPCOIN_MINT.toString(), count: result.length, holders: result });
```

} catch (err) {
console.error(err);
res.status(500).json({ error: err.message });
}
}
