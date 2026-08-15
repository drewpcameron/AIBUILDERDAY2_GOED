import { ResendForm } from "./resend-form";

export default function ResendPage() {
  return (
    <div className="relative flex flex-col flex-1 bg-zinc-950 bg-[url('/dashboard-background.jpg')] bg-cover bg-center bg-no-repeat">
      <div className="absolute inset-0 bg-zinc-950/70" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-md flex-1 px-6 py-16 sm:px-8">
        <p className="text-sm font-medium text-zinc-300">Utah Governor&apos;s Office of Economic Opportunity</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
          Get a new dashboard link
        </h1>
        <p className="mt-3 mb-8 text-sm text-zinc-300">
          If you set a recovery email on your dashboard before your link expired, enter it below and we&apos;ll
          send you a fresh one.
        </p>
        <ResendForm />
      </main>
    </div>
  );
}
