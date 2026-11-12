'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import { ChevronDown, ChevronUp, Loader2, MapPin, Plus, Route, Upload, X } from 'lucide-react'
import type { DocumentImage, ItineraryRouteStop } from '@/types'
import { OPENFREEMAP_ATTRIBUTION } from '@/lib/itinerary-route'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ROUTING_BASE_URL = process.env.NEXT_PUBLIC_OSRM_ROUTING_URL?.replace(/\/+$/, '')
  || 'https://router.project-osrm.org'

interface ItineraryMapEditorProps {
  routeStops: ItineraryRouteStop[]
  mapImage?: DocumentImage
  mapRouteSignature?: string
  onRouteStopsChange: (stops: ItineraryRouteStop[]) => void
  onMapImageChange: (image: DocumentImage, attribution: string, routeSignature: string) => void
}

interface OsrmResponse {
  code: string
  message?: string
  routes?: Array<{ geometry: LineString }>
}

function routeFeatures(geometry: LineString | null, stops: ItineraryRouteStop[]): FeatureCollection {
  const coordinates = stops
    .filter(stop => stop.latitude !== null && stop.longitude !== null)
    .map(stop => [stop.longitude!, stop.latitude!])
  const route: Feature<LineString> | null = geometry
    ? { type: 'Feature', properties: {}, geometry }
    : coordinates.length > 1
      ? { type: 'Feature', properties: { approximate: true }, geometry: { type: 'LineString', coordinates } }
      : null
  const waypoints: Feature<Point>[] = stops.flatMap((stop, index) =>
    stop.latitude === null || stop.longitude === null
      ? []
      : [{
        type: 'Feature',
        properties: { label: String(index + 1), name: stop.name },
        geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
      }]
  )

  return {
    type: 'FeatureCollection',
    features: [...(route ? [route] : []), ...waypoints],
  }
}

function readMapImage(file: File): Promise<DocumentImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected map image.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the selected map image.'))
        return
      }
      const source = new Image()
      source.onerror = () => reject(new Error('The selected file is not a supported image.'))
      source.onload = () => {
        const scale = Math.min(1, 1800 / source.width, 2400 / source.height)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(source.width * scale))
        canvas.height = Math.max(1, Math.round(source.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Could not process the selected map image.'))
          return
        }
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(source, 0, 0, canvas.width, canvas.height)
        const src = canvas.toDataURL('image/jpeg', 0.9)
        if (src.length > 12 * 1024 * 1024) {
          reject(new Error('The optimized map image is too large. Choose a smaller image.'))
          return
        }
        resolve({
          src,
          altText: 'User-supplied itinerary route map',
          width: canvas.width,
          height: canvas.height,
          displayWidth: 2.7,
          displayHeight: 4.8,
        })
      }
      source.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function ItineraryMapEditor({
  routeStops,
  mapImage,
  mapRouteSignature,
  onRouteStopsChange,
  onMapImageChange,
}: ItineraryMapEditorProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const routeSourceRef = useRef<GeoJSONSource | null>(null)
  const routeStopsRef = useRef(routeStops)
  const routeCoordinatesSignatureRef = useRef(JSON.stringify(routeStops.map(stop => [stop.latitude, stop.longitude])))
  const onRouteStopsChangeRef = useRef(onRouteStopsChange)
  const placementRef = useRef<number | 'new' | null>(null)
  const routeGeometryRef = useRef<LineString | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeMessage, setRouteMessage] = useState('Place any missing stops, then generate a road-following route.')
  const [isRouting, setIsRouting] = useState(false)
  const [placing, setPlacing] = useState<number | 'new' | null>(null)
  const [newStopName, setNewStopName] = useState('')
  const newStopNameRef = useRef(newStopName)
  const autoRouteStartedRef = useRef(false)

  useEffect(() => {
    routeStopsRef.current = routeStops
    const signature = JSON.stringify(routeStops.map(stop => [stop.latitude, stop.longitude]))
    if (signature !== routeCoordinatesSignatureRef.current) {
      routeCoordinatesSignatureRef.current = signature
      routeGeometryRef.current = null
      setRouteMessage('Stop locations or order changed. Generate the road route again to apply the change.')
    }
  }, [routeStops])

  useEffect(() => {
    onRouteStopsChangeRef.current = onRouteStopsChange
  }, [onRouteStopsChange])

  useEffect(() => {
    newStopNameRef.current = newStopName
  }, [newStopName])

  useEffect(() => {
    let active = true
    let map: MapLibreMap | null = null

    import('maplibre-gl').then(maplibre => {
      if (!active || !mapContainer.current) return
      maplibre.setWorkerUrl('/maplibre-gl-worker.mjs')
      map = new maplibre.Map({
        container: mapContainer.current,
        style: MAP_STYLE,
        center: [80.7, 7.7],
        zoom: 6.3,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        attributionControl: false,
      })
      mapRef.current = map
      map.addControl(new maplibre.NavigationControl(), 'top-right')
      map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right')
      map.on('load', () => {
        if (!map) return
        map.addSource('itinerary-route', {
          type: 'geojson',
          data: routeFeatures(routeGeometryRef.current, routeStopsRef.current),
        })
        routeSourceRef.current = map.getSource('itinerary-route') as GeoJSONSource
        map.addLayer({
          id: 'itinerary-route-line',
          type: 'line',
          source: 'itinerary-route',
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#3973B9',
            'line-width': 5,
            'line-opacity': 0.9,
            'line-dasharray': [2, 1],
          },
        })
        map.addLayer({
          id: 'itinerary-waypoint-circles',
          type: 'circle',
          source: 'itinerary-route',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 11,
            'circle-color': '#3973B9',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
          },
        })
        map.addLayer({
          id: 'itinerary-waypoint-labels',
          type: 'symbol',
          source: 'itinerary-route',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        })
        setMapReady(true)
      })
      map.on('click', event => {
        const target = placementRef.current
        if (target === null) return
        const stops = routeStopsRef.current
        const coordinates = {
          latitude: Number(event.lngLat.lat.toFixed(5)),
          longitude: Number(event.lngLat.lng.toFixed(5)),
        }
        if (target === 'new') {
          const name = newStopNameRef.current.trim() || `Stop ${stops.length + 1}`
          onRouteStopsChangeRef.current([...stops, { name, ...coordinates }])
          setNewStopName('')
        } else {
          onRouteStopsChangeRef.current(stops.map((stop, index) => index === target ? { ...stop, ...coordinates } : stop))
        }
        placementRef.current = null
        setPlacing(null)
        routeGeometryRef.current = null
        setRouteError(null)
        setRouteMessage('Stop location updated. Generate the road route again to include this change.')
      })
      map.on('error', event => {
        if (!map?.isStyleLoaded()) {
          setMapError(event.error.message || 'The free map could not be loaded.')
        }
      })
    }).catch(error => {
      if (active) setMapError(error instanceof Error ? error.message : 'The map editor could not be loaded.')
    })

    return () => {
      active = false
      map?.remove()
      mapRef.current = null
      routeSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    if (routeSourceRef.current) {
      routeSourceRef.current.setData(routeFeatures(routeGeometryRef.current, routeStops))
    }
    const locations = routeStops.filter(stop => stop.latitude !== null && stop.longitude !== null)
    if (locations.length > 1) {
      const bounds: [[number, number], [number, number]] = [
        [
          Math.min(...locations.map(stop => stop.longitude!)),
          Math.min(...locations.map(stop => stop.latitude!)),
        ],
        [
          Math.max(...locations.map(stop => stop.longitude!)),
          Math.max(...locations.map(stop => stop.latitude!)),
        ],
      ]
      mapRef.current.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 450 })
    } else if (locations.length === 1) {
      mapRef.current.easeTo({ center: [locations[0].longitude!, locations[0].latitude!], zoom: 8 })
    }
  }, [routeStops, mapReady])

  const beginPlacement = useCallback((target: number | 'new') => {
    placementRef.current = target
    setPlacing(target)
  }, [])

  const updateStopName = (index: number, name: string) => {
    onRouteStopsChange(routeStops.map((stop, stopIndex) =>
      stopIndex === index ? { ...stop, name } : stop
    ))
  }

  const moveStop = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= routeStops.length) return
    const reordered = [...routeStops]
    ;[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]
    routeGeometryRef.current = null
    onRouteStopsChange(reordered)
    setRouteMessage('Stop order changed. Generate the road route again to apply the new order.')
  }

  const removeStop = (index: number) => {
    routeGeometryRef.current = null
    onRouteStopsChange(routeStops.filter((_, stopIndex) => stopIndex !== index))
    setRouteMessage('Stop removed. Generate the road route again to update the map.')
  }

  const captureMap = async (stops: ItineraryRouteStop[]) => {
    const map = mapRef.current
    if (!mapReady || !map) return
    try {
      await new Promise<void>(resolve => {
        map.once('render', () => resolve())
        map.triggerRepaint()
      })
      const canvas = map.getCanvas()
      const src = canvas.toDataURL('image/jpeg', 0.92)
      if (src.length > 12 * 1024 * 1024) {
        setRouteError('The map image is too large to embed. Zoom out or use a smaller map image.')
        return
      }
      onMapImageChange({
        src,
        altText: 'Screenshot of the road map with the itinerary route and numbered stops',
        width: canvas.width,
        height: canvas.height,
        displayWidth: 2.4,
        displayHeight: 4.8,
      }, OPENFREEMAP_ATTRIBUTION, JSON.stringify(stops))
      setRouteMessage('Map screenshot added to the cover.')
    } catch (error) {
      setRouteError(error instanceof Error ? `Could not capture the map image: ${error.message}` : 'Could not capture the map image.')
    }
  }

  const generateRoadRoute = async () => {
    const locatedStops = routeStops.filter(stop => stop.latitude !== null && stop.longitude !== null)
    if (locatedStops.length < 2 || locatedStops.length !== routeStops.length) {
      setRouteError('Set a map location for every stop and place at least two stops before generating a road route.')
      return
    }
    setIsRouting(true)
    setRouteError(null)
    let routeReady = false
    try {
      const coordinates = locatedStops.map(stop => `${stop.longitude},${stop.latitude}`).join(';')
      const response = await fetch(
        `${ROUTING_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
        { signal: AbortSignal.timeout(25_000) }
      )
      if (!response.ok) throw new Error(`Routing service returned HTTP ${response.status}.`)
      const data = await response.json() as OsrmResponse
      if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
        throw new Error(data.message || 'The routing service could not find a road route for these stops.')
      }
      routeGeometryRef.current = data.routes[0].geometry
      if (routeSourceRef.current) {
        routeSourceRef.current.setData(routeFeatures(routeGeometryRef.current, routeStops))
      }
      routeReady = true
      setRouteMessage('Road-following route ready. Adding the map screenshot to the cover...')
    } catch (error) {
      routeGeometryRef.current = null
      const message = error instanceof Error ? error.message : 'Could not generate the road route.'
      setRouteError(`${message} You can still place stops manually or upload a map image.`)
      setRouteMessage('The displayed line joins stops directly and is not a road route.')
      if (routeSourceRef.current) {
        routeSourceRef.current.setData(routeFeatures(null, routeStops))
      }
    } finally {
      setIsRouting(false)
    }
    if (routeReady) await captureMap(routeStops)
  }

  useEffect(() => {
    const currentRouteSignature = JSON.stringify(routeStops)
    const mapMatchesRoute = Boolean(mapImage)
      && (!mapRouteSignature || mapRouteSignature === currentRouteSignature)
    if (!mapReady || mapMatchesRoute || autoRouteStartedRef.current) return
    if (routeStops.length < 2 || routeStops.some(stop => stop.latitude === null || stop.longitude === null)) return
    autoRouteStartedRef.current = true
    void generateRoadRoute()
  }, [mapReady, mapImage, mapRouteSignature, routeStops, generateRoadRoute])

  const applyMap = async () => {
    await captureMap(routeStops)
  }

  const handleUpload = async (file?: File) => {
    if (!file) return
    setRouteError(null)
    try {
      const image = await readMapImage(file)
      onMapImageChange(image, 'Map image supplied by user', JSON.stringify(routeStops))
      setRouteMessage('Uploaded map image saved to the cover.')
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Could not process the selected map image.')
    }
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-blue-900">Sri Lanka road map</h3>
          <p className="text-[10px] text-blue-700">Free OpenFreeMap background; place or reorder stops manually.</p>
        </div>
        <Route size={16} className="text-blue-600" />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div ref={mapContainer} className="mx-auto aspect-[3/4] w-full max-w-[320px]" />
          {placing !== null && (
            <div className="absolute left-2 top-2 rounded-md bg-blue-700 px-2 py-1 text-[10px] text-white shadow">
              Click the map to place {placing === 'new' ? 'the new stop' : routeStops[placing]?.name || 'the stop'}
            </div>
          )}
          {mapError && (
            <div className="absolute inset-x-2 top-2 rounded-md bg-red-50 p-2 text-[10px] text-red-700">
              {mapError}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="max-h-[270px] space-y-2 overflow-y-auto">
            {routeStops.map((stop, index) => (
              <div key={`${index}-${stop.name}`} className="rounded-lg border border-gray-200 bg-white p-2">
                <div className="flex items-start gap-1">
                  <MapPin size={14} className="mt-1 shrink-0 text-blue-600" />
                  <input
                    value={stop.name}
                    onChange={event => updateStopName(index, event.target.value)}
                    aria-label={`Stop ${index + 1} name`}
                    className="min-w-0 flex-1 border-0 bg-transparent text-xs font-medium text-gray-800 outline-none"
                  />
                  <button type="button" onClick={() => moveStop(index, -1)} disabled={index === 0} title="Move stop up" className="text-gray-500 disabled:opacity-30">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" onClick={() => moveStop(index, 1)} disabled={index === routeStops.length - 1} title="Move stop down" className="text-gray-500 disabled:opacity-30">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeStop(index)} title="Remove stop" className="text-gray-400 hover:text-red-600">
                    <X size={14} />
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between gap-1 pl-5 text-[9px] text-gray-500">
                  <span>{stop.latitude === null || stop.longitude === null
                    ? 'Location not set'
                    : `${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)}`}</span>
                  <button type="button" onClick={() => beginPlacement(index)} className="font-medium text-blue-700 hover:underline">
                    Place on map
                  </button>
                </div>
              </div>
            ))}
            {!routeStops.length && <p className="text-[10px] text-gray-500">Add stops or enter destinations above, then place them on the map.</p>}
          </div>

          <div className="flex gap-2">
            <input
              value={newStopName}
              onChange={event => setNewStopName(event.target.value)}
              placeholder="New stop name"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] outline-none focus:border-blue-400"
            />
            <button type="button" onClick={() => beginPlacement('new')} disabled={!mapReady} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[10px] font-medium text-blue-700 disabled:opacity-50">
              <Plus size={12} /> Add on map
            </button>
          </div>
        </div>
      </div>

      {routeError && <p role="alert" className="mb-2 text-[10px] text-red-700">{routeError}</p>}
      <p className="mb-2 text-[10px] text-gray-600">{routeMessage}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={generateRoadRoute} disabled={!mapReady || isRouting} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-blue-800 disabled:opacity-50">
          {isRouting ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
          {isRouting ? 'Routing...' : 'Generate road route'}
        </button>
        <button type="button" onClick={applyMap} disabled={!mapReady} className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-blue-700 disabled:opacity-50">
          Apply map to cover
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50">
          <Upload size={12} /> Upload map image
          <input type="file" accept="image/*" className="hidden" onChange={event => {
            void handleUpload(event.target.files?.[0])
            event.currentTarget.value = ''
          }} />
        </label>
      </div>
      <p className="mt-2 text-[9px] text-gray-500">
        {mapImage ? 'A map image is included in the cover. Re-apply after changing stops.' : 'The cover map is blank until you apply a road map or upload your own image.'}
        {' '}{OPENFREEMAP_ATTRIBUTION}
      </p>
    </section>
  )
}
