import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { ALL_POSTS } from "@/content/blog";
import { CATEGORIES, postBySlug, publishedPosts } from "@/lib/blog";
import { siteOrigin } from "@/lib/seo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Only published posts have a share image; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return publishedPosts(ALL_POSTS).map((post) => ({ slug: post.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(ALL_POSTS, slug);
  const title = post ? post.title : BRAND.name;
  const category = post ? (CATEGORIES[post.category]?.name ?? post.category) : "Blog";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "28px",
              fontWeight: 700,
              color: "#38bdf8",
            }}
          >
            {BRAND.name}
          </div>
          <div
            style={{
              padding: "8px 20px",
              borderRadius: "9999px",
              backgroundColor: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            {category}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              fontSize: title.length > 50 ? "52px" : "62px",
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "#ffffff",
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
            paddingTop: "24px",
            fontSize: "22px",
            color: "#a1a1aa",
          }}
        >
          <div>{`${new URL(siteOrigin()).host}/blogs`}</div>
          <div>Real Estate Marketing & Lead Management</div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
