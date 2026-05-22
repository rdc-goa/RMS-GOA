import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://rndprojects.goa.paruluniversity.ac.in'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/_next/',
          '/static/',
          '/dashboard/settings',
          '/dashboard/manage-users',
          '/dashboard/bulk-upload',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
