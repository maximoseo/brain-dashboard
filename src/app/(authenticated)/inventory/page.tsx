import { Suspense } from "react";
import { LoadingState } from "@/components/feedback/states";
import { InventoryView } from "@/features/inventory/inventory-view";

export default function InventoryPage() {
  return <Suspense fallback={<LoadingState label="Loading inventory…" />}><InventoryView /></Suspense>;
}
