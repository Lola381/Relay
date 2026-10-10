import { redirect } from 'next/navigation';

// The Start screen is the home page; the (app) layout sends signed-out visitors to /login.
export default function Home() {
  redirect('/dashboard');
}
