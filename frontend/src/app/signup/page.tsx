import { AuthLayout } from "@/components/auth/auth-layout";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Create an account to save uploads and study materials under your profile."
    >
      <SignupForm />
    </AuthLayout>
  );
}
