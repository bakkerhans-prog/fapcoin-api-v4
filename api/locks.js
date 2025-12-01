import { Connection, PublicKey } from "@solana/web3.js";
import * as BufferLayout from "buffer-layout";

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

// Minimal VestingEscrow layout (matches Rust struct size = 288)
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
    // Fetch accounts with dataSlice set to the expected size (optional optimization)
    const accounts = await connection.getProgramAccounts(LOCK_PROGRAM_ID, {
      dataSlice: { offset: 0, length: 288 },
    });

    const holders = [];

    for (const acc of accounts) {
      try {
        // Ensure we have a Node Buffer before decoding
        let raw = acc.account?.data;
        if (!raw) continue;

        // If raw is an array or Uint8Array, convert to Buffer
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

        // sanity check length
        if (buf.length < 288) {
          // skip short/unexpected data
          continue;
        }

        const info = VestingEscrowLayout.decode(buf);

        // token_mint and recipient are raw bytes — build Pubkeys
        const tokenMint = new PublicKey(info.token_mint).toBase58();
        if (tokenMint !== TOKEN_MINT.toBase58()) continue; // Not FAPCOIN lock

        const recipient = new PublicKey(info.recipient).toBase58();

        // compute total vesting and locked amount
        const totalVesting =
          Number(info.cliff_unlock_amount) +
          Number(info.amount_per_period) * Number(info.number_of_period);

        const claimed = Number(info.total_claimed_amount) || 0;
        const locked = Math.max(0, totalVesting - claimed);

        holders.push({
          recipient,
          locked,
          totalVesting,
          escrowAccount: acc.pubkey.toBase58(),
        });
      } catch (innerErr) {
        // Log decode/parsing errors so we can diagnose — don't crash the whole function
        console.warn("Skipping account (decode error):", String(innerErr));
        continue;
      }
    }

    return res.status(200).json({
      token: TOKEN_MINT.toBase58(),
      count: holders.length,
      holders,
    });
  } catch (err) {
    console.error("Handler top-level error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
