import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";
import { getConfig } from "@/lib/fwb/config";
import { checkAndUpgradeTier } from "@/lib/fwb/tiers";

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { wallet_id, amount, description } = body;

    if (!wallet_id || amount === undefined || amount === null || !description) {
      return NextResponse.json(
        { error: "wallet_id, amount, and description are required" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount === 0) {
      return NextResponse.json(
        { error: "amount must be a non-zero number" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch the wallet
    const { data: wallet, error: walletError } = await supabase
      .from("fwb_wallets")
      .select("*")
      .eq("id", wallet_id)
      .eq("venue_id", auth.venueId!)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const newBalance = wallet.current_benefits_balance + amount;

    if (newBalance < 0) {
      return NextResponse.json(
        { error: `Cannot deduct ${Math.abs(amount)} benefits. Current balance is ${wallet.current_benefits_balance}` },
        { status: 400 }
      );
    }

    // Update wallet balance (and lifetime if positive adjustment)
    const updateFields: Record<string, unknown> = {
      current_benefits_balance: newBalance,
      updated_at: new Date().toISOString(),
    };

    if (amount > 0) {
      updateFields.lifetime_benefits_earned = wallet.lifetime_benefits_earned + amount;
    }

    const { error: updateError } = await supabase
      .from("fwb_wallets")
      .update(updateFields)
      .eq("id", wallet_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create admin_adjust transaction
    const { error: txnError } = await supabase.from("fwb_transactions").insert({
      wallet_id,
      transaction_type: "admin_adjust",
      amount,
      balance_after: newBalance,
      description,
      event_id: null,
      order_id: null,
      reward_id: null,
      multiplier_applied: 1.0,
    });

    if (txnError) {
      console.error("Failed to create admin_adjust transaction:", txnError);
    }

    // Check for tier upgrade if positive adjustment
    if (amount > 0) {
      try {
        const config = await getConfig(auth.venueId!, supabase);
        await checkAndUpgradeTier(wallet_id, config, supabase);
      } catch (tierErr) {
        console.error("Tier check after admin adjust failed:", tierErr);
      }
    }

    // Re-fetch updated wallet
    const { data: updatedWallet } = await supabase
      .from("fwb_wallets")
      .select("*")
      .eq("id", wallet_id)
      .single();

    return NextResponse.json(updatedWallet);
  } catch (err) {
    console.error("FWB admin adjust-balance error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
