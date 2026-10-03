/** Money is always integer minor units (paise for INR); never a float. */
export interface Money {
  amount: number;
  currency: 'INR';
}
