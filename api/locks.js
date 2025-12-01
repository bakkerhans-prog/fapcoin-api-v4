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

// RPC (use a reliable provider)
const RPC = "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC, "confirmed");

// Minimal VestingEscrow layout (first fields we need)
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
    // -------------------------------------------------------
    // Fetch only accounts with token_mint = FAPCOIN
    // -------------------------------------------------------
    const accounts = await connection.getProgramAccounts(LOCK_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 32, // token_mint starts at byte 32
            bytes: TOKEN_MINT.toBase58(),
          },
        },
      ],
      dataSlice: { offset: 0, length: 288 }, // fetch only first 288 bytes
    });

    const holders = accounts.map((acc) => {
      const info = VestingEscrowLayout.decode(acc.account.data);

      const recipient = new PublicKey(info.recipient).toBase58();
      const totalLocked =
        Number(info.cliff_unlock_amount) +
        Number(info.amount_per_period) * Number(info.number_of_period);

      return {
        recipient,
        totalLocked,
        escrowAccount: acc.pubkey.toBase58(),
      };
    });

    res.status(200).json({
      token: TOKEN_MINT.toBase58(),
      count: holders.length,
      holders,
    });
  } catch (err) {
    console.error("Error fetching FAPCOIN locks:", err);
    res.status(500).json({ error: String(err) });
  }
}
