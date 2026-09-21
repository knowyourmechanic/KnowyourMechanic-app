// Razorpay Standard Checkout, opened as an IN-APP modal overlay. The checkout.js
// widget renders inside the current page — in the browser and inside the
// Capacitor Android webview alike — so the garage never leaves the app. UPI apps
// open via intents and return. The server webhook is the source of truth for a
// completed payment; the success handler here only tells the UI to refresh.

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loadingPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).Razorpay) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = CHECKOUT_SRC;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            loadingPromise = null;
            reject(new Error('Could not load the payment module. Check your connection and try again.'));
        };
        document.body.appendChild(s);
    });
    return loadingPromise;
}

export interface CheckoutOptions {
    keyId: string;
    orderId: string;
    amount: number;   // paise
    currency: string;
    name: string;     // merchant/business name shown in the sheet
    description?: string;
    prefill?: { name?: string; contact?: string; email?: string };
}

export interface CheckoutResult {
    paymentId: string;
    orderId: string;
    signature: string;
}

// Opens the checkout and resolves on a successful payment, rejects on
// dismissal/failure. Settlement is finalized server-side by the webhook.
export async function openRazorpayCheckout(o: CheckoutOptions): Promise<CheckoutResult> {
    await loadCheckoutScript();
    const RazorpayCtor = (window as any).Razorpay;
    if (!RazorpayCtor) throw new Error('Payment module unavailable.');

    return new Promise<CheckoutResult>((resolve, reject) => {
        let settled = false;
        const rzp = new RazorpayCtor({
            key: o.keyId,
            order_id: o.orderId,
            amount: o.amount,
            currency: o.currency,
            name: o.name,
            description: o.description,
            prefill: o.prefill,
            theme: { color: '#2563eb' },
            handler: (resp: any) => {
                settled = true;
                resolve({
                    paymentId: resp.razorpay_payment_id,
                    orderId: resp.razorpay_order_id,
                    signature: resp.razorpay_signature,
                });
            },
            modal: {
                ondismiss: () => {
                    if (!settled) reject(new Error('Payment cancelled.'));
                },
            },
        });
        rzp.on('payment.failed', (resp: any) => {
            settled = true;
            reject(new Error(resp?.error?.description || 'Payment failed. Please try again.'));
        });
        rzp.open();
    });
}
