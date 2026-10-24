"""
ai_narrate.py — AI-Powered Financial Audit & Anomaly Narrative Generator
Uses Google Gemini API to analyze payment gateway findings from dashboard_data.json
and generate plain-English explanations, root-cause analyses, evidence summaries,
and recommended next steps for the finance team.
"""

import json
import os
import sys
import argparse
import urllib.request
import urllib.error
from datetime import datetime

DEFAULT_API_KEY = "AQ.Ab8RN6KWYOC53v8bCNvo2gr4D43OAHzs7hyLCs6Qckl_qJw3Qw"
PREFERRED_MODEL = "gemini-2.5-flash-lite"
FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-flash-latest"
]

def call_gemini(prompt: str, system_instruction: str, api_key: str, model_name: str) -> dict:
    """Calls Gemini generateContent API with automatic model fallback."""
    models_to_try = [model_name] + [m for m in FALLBACK_MODELS if m != model_name]
    
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
    
    encoded_data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    
    last_error = None
    for m in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=encoded_data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                text = res["candidates"][0]["content"]["parts"][0]["text"]
                # Parse JSON returned by model
                try:
                    parsed = json.loads(text)
                    return {"data": parsed, "model_used": m}
                except json.JSONDecodeError:
                    # In case of formatting markdown fences
                    clean_text = text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    if clean_text.startswith("```"):
                        clean_text = clean_text[3:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    return {"data": json.loads(clean_text.strip()), "model_used": m}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            # If 404 (model not found / deprecated) or 400 with model error, try next candidate
            if e.code in (404, 400):
                print(f"  [Notice] Model {m} unavailable ({e.code}), falling back to next model...")
                last_error = f"{e.code}: {err_body}"
                continue
            raise RuntimeError(f"Gemini API HTTP {e.code}: {err_body}")
        except Exception as e:
            last_error = str(e)
            continue
            
    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")


def generate_narratives(data_path: str, api_key: str, model_name: str) -> dict:
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    overview = data.get("overview", {})
    reconciliation = data.get("reconciliation", {})
    overcharges = data.get("overcharges", {})
    savings_model = data.get("savings_model", {})
    renegotiation = data.get("renegotiation", {})
    fx_analysis = data.get("fx_analysis", {})
    
    gw_a = overview.get("gatewayA", {})
    gw_b = overview.get("gatewayB", {})

    system_instruction = (
        "You are a Senior Fintech & Payment Operations Analyst assisting a corporate Finance Director. "
        "Analyze the provided payment reconciliation and fee audit numbers. Provide clear, professional, "
        "evidence-backed findings. Your language must be rigorous, precise, actionable, and free of fluff. "
        "Always output strictly valid JSON matching the schema requested."
    )

    narratives = {
        "generated_at": datetime.now().isoformat(),
        "model": model_name,
        "sections": {}
    }

    # 1. Executive Briefing
    print("1/4 Generating Executive Audit Briefing...")
    prompt_exec = f"""
Analyze the overall payment gateway operations for CuteMath:
- Gateway A: Volume ₹{gw_a.get('total_volume', 0):,.2f}, Total Fees ₹{gw_a.get('total_charges', 0):,.2f}, Effective Rate {gw_a.get('effective_rate', 0)}%, Avg Settlement {gw_a.get('avg_settlement_days', 0)} days, Failure Rate {gw_a.get('failure_rate', 0)}%.
- Gateway B: Volume ₹{gw_b.get('total_volume', 0):,.2f}, Total Fees ₹{gw_b.get('total_charges', 0):,.2f}, Effective Rate {gw_b.get('effective_rate', 0)}%, Avg Settlement {gw_b.get('avg_settlement_days', 0)} days.
- Overcharges Detected on Gateway A: {overcharges.get('count', 0)} transactions totaling ₹{overcharges.get('total_overcharge', 0):,.2f}.
- Monthly Cost Optimization Potential: ₹{renegotiation.get('total_monthly_saving', 0):,.2f} (~₹1.02 Crore/year) by smart routing.

Return JSON with this schema:
{{
  "headline": "Short compelling summary sentence",
  "plain_english_summary": "2-3 paragraphs explaining the big picture to executive leadership",
  "key_findings": [
    {{"metric": "...", "finding": "...", "impact": "High/Medium/Low"}}
  ],
  "strategic_recommendations": [
    {{"priority": 1, "action": "...", "rationale": "...", "financial_benefit": "..."}}
  ]
}}
"""
    res_exec = call_gemini(prompt_exec, system_instruction, api_key, model_name)
    narratives["sections"]["executive_briefing"] = res_exec["data"]
    narratives["model"] = res_exec["model_used"]

    # 2. Overcharges & Billing Audit
    print("2/4 Generating Overcharge & Tariff Discrepancy Analysis...")
    # Dynamic breakdown of overcharges by network / method
    oc_items = overcharges.get('items', [])
    network_summary = {}
    for item in oc_items:
        net = item.get('card_network') or item.get('method') or 'Other'
        if net not in network_summary:
            network_summary[net] = {'count': 0, 'overcharge': 0.0, 'actual_rates': []}
        network_summary[net]['count'] += 1
        network_summary[net]['overcharge'] += float(item.get('overcharge', 0))
        if item.get('actual_rate'):
            network_summary[net]['actual_rates'].append(float(item.get('actual_rate')))

    net_lines = []
    for net, s in network_summary.items():
        avg_act = sum(s['actual_rates']) / len(s['actual_rates']) if s['actual_rates'] else 0
        net_lines.append(f"  * {net}: {s['count']} txns, ₹{s['overcharge']:,.2f} overcharge, charged average {avg_act:.2f}%")
    breakdown_text = "\n".join(net_lines) if net_lines else "  * None detected"

    sample_items = oc_items[:3]
    sample_text = ", ".join([
        f"{it.get('payment_id')} ({it.get('card_network') or it.get('method')}, vol: ₹{float(it.get('amount_inr', 0)):,.2f}, fee: ₹{float(it.get('actual_fee', 0)):,.2f} vs expected ₹{float(it.get('expected_fee', 0)):,.2f}, overcharge: ₹{float(it.get('overcharge', 0)):,.2f})"
        for it in sample_items
    ]) if sample_items else "None"

    prompt_overcharge = f"""
Examine the overcharge audit findings:
- Total flagged transactions: {overcharges.get('count', 0)}
- Total overcharge amount: ₹{overcharges.get('total_overcharge', 0):,.2f}
- Contracted rates: Domestic Card = {overcharges.get('contracted_rates', {}).get('domestic_card')}%, Domestic UPI = {overcharges.get('contracted_rates', {}).get('upi')}%, EMI = {overcharges.get('contracted_rates', {}).get('emi')}%
- Breakdown by network/method:
{breakdown_text}
- Sample overcharged payment IDs: {sample_text}

Generate a structured financial report explaining:
1. Plain-English explanation of what occurred and why these transactions were flagged.
2. The supporting evidence from the reconciliation logs.
3. The root-cause analysis (e.g. why did the gateway charge 3.2%-3.74% on domestic cards when contract states 2%?).
4. Recommended next steps for the finance team.
5. A formal, ready-to-send dispute notice email to Gateway A's merchant support team citing specific clauses and sample transaction IDs.

Return JSON with this schema:
{{
  "title": "Gateway A Fee Discrepancy & Overcharge Investigation",
  "plain_english_explanation": "Detailed explanation of the billing anomaly",
  "evidence_summary": [
    {{"label": "...", "detail": "..."}}
  ],
  "root_cause_analysis": "Technical and operational reason for the discrepancy",
  "recommended_investigation_steps": [
    "Step 1...",
    "Step 2...",
    "Step 3..."
  ],
  "dispute_email_draft": {{
    "subject": "Formal Notice: Fee Discrepancy & Dispute for Merchant ID ...",
    "recipient": "Merchant Billing Operations, Gateway A",
    "body": "Complete formal email body requesting refund/credit note of ₹39,255..."
  }}
}}
"""
    res_oc = call_gemini(prompt_overcharge, system_instruction, api_key, model_name)
    narratives["sections"]["overcharge_investigation"] = res_oc["data"]

    # 3. Smart Routing & Savings Model
    print("3/4 Generating Smart Routing & Cost Optimization Strategy...")
    sm = data.get('savings_model', {})
    sm_items = sm.get('items', [])
    routing_lines = [
        f"  * {it['network']}: Gateway A rate {it.get('gateway_a_rate', 0)}% vs Gateway B {it.get('gateway_b_rate', 0)}% (Save ₹{it.get('potential_saving', 0):,.2f}/mo by routing to Gateway {it.get('cheapest_gateway')})"
        for it in sm_items
    ]
    routing_breakdown = "\n".join(routing_lines) if routing_lines else "  * No routing optimizations detected"

    prompt_routing = f"""
Analyze the gateway cost comparison and smart routing model:
- Total potential monthly savings: ₹{sm.get('total_potential_saving', 0):,.2f}
- Annualized savings: ₹{sm.get('annualized_saving', 0):,.2f}
- Network routing breakdown:
{routing_breakdown}
- Operational considerations: Gateway A failure rate {overview.get('gatewayA', {}).get('failure_rate', 0)}% vs Gateway B settlement float ({overview.get('gatewayB', {}).get('avg_settlement_days', 0)} days).

Generate plain-English guidance for the finance and engineering teams:
1. Explain the rate disparity between gateways for these payment methods.
2. What evidence supports shifting volume according to the savings model?
3. What trade-offs or operational risks must be checked (e.g., failure rates, settlement days)?
4. Actionable 3-phase execution roadmap for finance and payment routing.

Return JSON with this schema:
{{
  "title": "Smart Gateway Routing & Fee Arbitrage Analysis",
  "plain_english_explanation": "Clear explanation of the rate disparity and savings rationale",
  "evidence": [
    {{"network": "...", "rate_gap": "...", "monthly_saving": "..."}}
  ],
  "root_cause_and_tradeoffs": "Why the disparity exists and critical operational caveats (failure rates/reliability)",
  "implementation_roadmap": [
    {{"phase": "Phase 1 (Immediate)", "actions": "..."}},
    {{"phase": "Phase 2 (30 Days)", "actions": "..."}},
    {{"phase": "Phase 3 (Ongoing)", "actions": "..."}}
  ]
}}
"""
    res_route = call_gemini(prompt_routing, system_instruction, api_key, model_name)
    narratives["sections"]["smart_routing_strategy"] = res_route["data"]

    # 4. FX Cross-Border & Settlement Float Analysis
    print("4/4 Generating FX & Settlement Working Capital Analysis...")
    fx = data.get('fx_analysis', {})
    fx_a = fx.get('gatewayA', {})
    fx_b = fx.get('gatewayB', {})
    gA = overview.get('gatewayA', {})
    gB = overview.get('gatewayB', {})

    prompt_fx = f"""
Analyze cross-border FX and settlement terms:
- Gateway A: Domestic {fx_a.get('dom_rate', 0)}%, International {fx_a.get('intl_rate', 0)}% (FX premium: +{fx_a.get('premium_pp', 0)} percentage points). Avg settlement: {gA.get('avg_settlement_days', 0)} days.
- Gateway B: Domestic {fx_b.get('dom_rate', 0)}%, International {fx_b.get('intl_rate', 0)}% (FX premium: +{fx_b.get('premium_pp', 0)} percentage points). Avg settlement: {gB.get('avg_settlement_days', 0)} days.

Generate plain-English audit insights on:
1. FX & Cross-border markups: Plain explanation of how international markups eat into margins.
2. Working capital impact: What holding funds for {gB.get('avg_settlement_days', 0)} days on Gateway B costs in cash-flow float compared to Gateway A's {gA.get('avg_settlement_days', 0)}-day settlement.
3. Recommended next steps for international payment stack optimization.

Return JSON with this schema:
{{
  "title": "Cross-Border FX & Working Capital Velocity Audit",
  "fx_markup_explanation": "Plain-English analysis of international interchange and currency conversion markup",
  "working_capital_impact": "Plain-English assessment of the 4.5-day float difference on Gateway B vs Gateway A",
  "country_risk_observations": [
    {{"region": "US Dollar Traffic", "detail": "..."}},
    {{"region": "Middle East & Commonwealth", "detail": "..."}}
  ],
  "recommended_treasury_actions": [
    "Action 1...",
    "Action 2...",
    "Action 3..."
  ]
}}
"""
    res_fx = call_gemini(prompt_fx, system_instruction, api_key, model_name)
    narratives["sections"]["fx_and_treasury_audit"] = res_fx["data"]

    return narratives


def main():
    parser = argparse.ArgumentParser(description="Generate AI narratives for payment gateway audit.")
    parser.add_argument("--api-key", default=os.getenv("GEMINI_API_KEY", DEFAULT_API_KEY), help="Google Gemini API Key")
    parser.add_argument("--model", default=PREFERRED_MODEL, help=f"Gemini Model name (default: {PREFERRED_MODEL})")
    parser.add_argument("--input", default="dashboard_data.json", help="Input dashboard JSON file path")
    parser.add_argument("--output", default="ai_narratives.json", help="Output AI narratives JSON file path")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' not found. Please run process_data.py first.")
        sys.exit(1)

    print(f"=== CuteMath AI Financial Narrative Generator ===")
    print(f"Input: {args.input}")
    print(f"Requested Model: {args.model}")
    print(f"API Key: {args.api_key[:6]}...{args.api_key[-4:]}")
    print("Calling Gemini API...")

    try:
        narratives = generate_narratives(args.input, args.api_key, args.model)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(narratives, f, indent=2, ensure_ascii=False)
        print(f"\n[Success] AI narratives successfully written to: {args.output}")
        print(f"Model used: {narratives.get('model')}")
        print("Sections generated:")
        for k in narratives.get("sections", {}).keys():
            print(f"  - {k}")
    except Exception as e:
        print(f"\n[Error] Failed to generate AI narratives: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
