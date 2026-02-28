import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <Image
        src="/login-background.jpg"
        alt="Login background"
        fill
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-sm md:max-w-4xl">
        <LoginForm />
      </div>
    </div>
  );
}
