import { Connection, PublicKey } from "@solana/web3.js";
import * as BufferLayout from "@solana/buffer-layout";

// Jupiter Lock Program ID
const LOCK_PROGRAM_ID = new PublicKey(
  "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn"
);

// FAPCOIN mint
const TOKEN_MINT = new PublicKey(
  "8vGr1eX9vfpootWiUPYa5kYoGx9bTuRy2Xc4dNMrpump"
);

// RPC (use a GOOD provider)
const RPC = "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC, "confirmed");

// Minimal VestingEscrow layout
const VestingEscrowLayout = BufferLayout.struct([
  BufferLayout.blob(32, "recipient"),
  BufferLayout.blob(32, "token_mint"),
  BufferLayout.blob(32, "creator"),
  BufferLayout.blob(32, "base"),
  BufferLayout.u8("escrow_bump"),
  BufferLayout.u8("update_recipient_mode"),
  BufferLayout.u8("cancel_mode"),
  BufferLayout.u8("token_program_flag"),
  BufferLayout.blob(4, "padding0"),
  BufferLayout.nu64("cliff_time"),
  BufferLayout.nu64("frequency"),
  BufferLayout.nu64("cliff_unlock_amount"),
  BufferLayout.nu64("amount_per_period"),
  BufferLayout.nu64("number_of_period"),
  BufferLayout.nu64("total_claimed_amount"),
  BufferLayout.nu64("vesting_start_time"),
  BufferLayout.nu64("cancelled_at"),
  BufferLayout.nu64("padding1"),
  BufferLayout.blob(16 * 5, "buffer") // 5 x u128
]);

export default async function handler(req, res) {
  try {
    // 1. Get all accounts owned by Jupiter Lock program
    const accounts = await connection.getProgramAccounts(LOCK_PROGRAM_ID, {
      dataSlice: { offset: 0, length: 288 }, // VestingEscrow size
    });

    const holders = [];

    for (const acc of accounts) {
      try {
        const info = VestingEscrowLayout.decode(acc.account.data);

        const tokenMint = new PublicKey(info.token_mint).toBase58();
        if (tokenMint !== TOKEN_MINT.toBase58()) continue; // Skip non-FAPCOIN

        const recipient = new PublicKey(info.recipient).toBase58();

        const totalLocked =
          Number(info.cliff_unlock_amount) +
          Number(info.amount_per_period) * Number(info.number_of_period);

        holders.push({
          recipient,
          totalLocked,
          escrowAccount: acc.pubkey.toBase58(),
        });
      } catch (e) {
        // skip unparseable accounts
      }
    }

    res.status(200).json({
      token: TOKEN_MINT.toBase58(),
      count: holders.length,
      holders,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
