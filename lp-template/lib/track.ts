// 申込ボタンのクリックやフォーム送信を、GA4 / Meta Pixel に「成果」として送る
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export function track(event: "cta_click" | "checkout_click" | "generate_lead" | "line_click", params: Record<string, string> = {}) {
  window.gtag?.("event", event, params);
  if (event === "generate_lead") window.fbq?.("track", "Lead", params);
  if (event === "checkout_click") window.fbq?.("track", "InitiateCheckout", params);
}
