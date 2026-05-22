import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://rndprojects.goa.paruluniversity.ac.in'
  const lastModified = new Date()

  const routes = [
    '',
    '/login',
    '/signup',
    '/forgot-password',
    '/privacy-policy',
    '/terms-of-use',
    '/sop',
    '/help',
    '/hiring',
    '/system-health',
    '/dashboard',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: (route === '' ? 'weekly' : 'monthly') as any,
    priority: route === '' ? 1 : 0.8,
  }))

  return routes
}
