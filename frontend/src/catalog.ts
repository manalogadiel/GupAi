import { useEffect, useState } from 'react'
import { api, type CatalogItem, type Part } from './api'

let cache: Promise<Record<Part, CatalogItem[]>> | null = null

/** The full sides/top catalog, fetched once per page load. */
export function useCatalog() {
  const [data, setData] = useState<Record<Part, CatalogItem[]> | null>(null)
  useEffect(() => {
    cache ??= api.parts().catch(e => { cache = null; throw e })
    let live = true
    cache.then(d => { if (live) setData(d) }, () => {})
    return () => { live = false }
  }, [])
  return data
}

export function cutName(catalog: Record<Part, CatalogItem[]> | null, part: Part, id: string | null | undefined) {
  return catalog?.[part].find(o => o.id === id)?.name ?? id?.replaceAll('_', ' ') ?? '—'
}
