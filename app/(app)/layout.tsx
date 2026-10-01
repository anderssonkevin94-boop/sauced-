import { KeepOffline } from "@/components/Pwa";
import { requireMe } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireMe();
  return (
    <>
      {children}
      <KeepOffline />
    </>
  );
}
