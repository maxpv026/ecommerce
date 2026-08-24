import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRecommendedProducts } from "@/lib/data";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ products: [] });
  }

  const products = await getRecommendedProducts(session.user.id);
  return NextResponse.json({ products });
}
