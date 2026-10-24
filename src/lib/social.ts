export interface SocialPreview {
  description: string;
  image: string;
  imageAlt: string;
}

/** pathname 已含部署 base；圖片路徑則需補一次 base。排除查詢參數與 hash。 */
export function socialUrls(site: URL, pathname: string, base: string, image: string) {
  const pageUrl = new URL(pathname, site);
  pageUrl.search = '';
  pageUrl.hash = '';
  pageUrl.pathname = pageUrl.pathname.replace(/\/?$/, '/');
  return {
    url: pageUrl.href,
    image: new URL(`${base.replace(/\/$/, '')}${image}`, site).href,
  };
}
