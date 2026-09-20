import type { Metadata } from 'next';
import { ResetPasswordClient } from '@/components/tradeup/ResetPasswordClient';
import '../legal-pages.css';

export const metadata: Metadata = {
  title: 'Reset Password — 1B Run',
  description: 'Choose a new password for your 1B Run account.',
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
