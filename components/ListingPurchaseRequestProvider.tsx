"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePurchaseRequest } from "@/components/usePurchaseRequest";

type PurchaseController = ReturnType<typeof usePurchaseRequest>;

type ListingPurchaseRequestContextValue = {
  listingId: string;
  controller: PurchaseController;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

const ListingPurchaseRequestContext =
  createContext<ListingPurchaseRequestContextValue | null>(null);

export default function ListingPurchaseRequestProvider({
  listingId,
  askingPrice,
  askingCurrency,
  children,
}: {
  listingId: string;
  askingPrice: number;
  askingCurrency: string | null;
  children: ReactNode;
}) {
  const controller = usePurchaseRequest(
    { id: listingId, askingPrice, askingCurrency },
    "live"
  );
  const [open, setOpen] = useState(false);

  return (
    <ListingPurchaseRequestContext.Provider
      value={{ listingId, controller, open, setOpen }}
    >
      {children}
    </ListingPurchaseRequestContext.Provider>
  );
}

export function useListingPurchaseRequest(listingId: string) {
  const value = useContext(ListingPurchaseRequestContext);
  if (!value || value.listingId !== listingId) {
    throw new Error("Listing Purchase Request must be rendered inside its listing provider.");
  }
  return { ...value.controller, open: value.open, setOpen: value.setOpen };
}
