import Razorpay from 'razorpay';

let razorpayClient: Razorpay | undefined;

export function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }

  return { keyId, keySecret };
}

export function getRazorpayClient(): Razorpay {
  if (!razorpayClient) {
    const { keyId, keySecret } = getRazorpayConfig();
    razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  return razorpayClient;
}
