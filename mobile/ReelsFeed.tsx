import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type ViewToken,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

type Reel = {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string;
  creator_name: string;
  created_at: string;
};

type FeedReel = Reel & { feedKey: string };
type FeedResponse = {
  items: Reel[];
  next_cursor: string | null;
  has_more: boolean;
};

type ReelsFeedProps = {
  apiBaseUrl: string;
  accessToken?: string;
  pageSize?: number;
};

const viewabilityConfig = {
  itemVisiblePercentThreshold: 80,
  minimumViewTime: 50,
};

function ReelPage({ reel, active, height }: { reel: FeedReel; active: boolean; height: number }) {
  const player = useVideoPlayer(reel.video_url, videoPlayer => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.pause();
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
    return () => player.pause();
  }, [active, player]);

  return (
    <View style={[styles.page, { height }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
      />
      <View pointerEvents="none" style={styles.scrim} />
      <View pointerEvents="none" style={styles.details}>
        <Text numberOfLines={1} style={styles.creator}>{reel.creator_name}</Text>
        {!!reel.caption && <Text numberOfLines={3} style={styles.caption}>{reel.caption}</Text>}
      </View>
    </View>
  );
}

export default function ReelsFeed({ apiBaseUrl, accessToken, pageSize = 5 }: ReelsFeedProps) {
  const { height } = useWindowDimensions();
  const [items, setItems] = useState<FeedReel[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const itemsRef = useRef<FeedReel[]>([]);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const nextKeyRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const loadNextRef = useRef<(reset?: boolean) => Promise<void>>(async () => {});

  const loadNext = useCallback(async (reset = false) => {
    if (loadingRef.current || (!reset && !hasMoreRef.current)) return;
    loadingRef.current = true;
    setError("");
    if (reset) setLoading(true);
    else setLoadingMore(true);

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const baseUrl = apiBaseUrl.replace(/\/+$/, "");
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (!reset && cursorRef.current) params.set("cursor", cursorRef.current);
      const response = await fetch(`${baseUrl}/api/reels?${params.toString()}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
      const page = await response.json() as FeedResponse;
      const newItems = page.items.map(reel => ({ ...reel, feedKey: `${reel.id}:${nextKeyRef.current++}` }));
      const updatedItems = reset ? newItems : [...itemsRef.current, ...newItems];
      itemsRef.current = updatedItems;
      setItems(updatedItems);
      cursorRef.current = page.next_cursor;
      hasMoreRef.current = page.has_more;
      if (reset) setActiveKey(null);
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "Unable to load Reels.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [accessToken, apiBaseUrl, pageSize]);

  loadNextRef.current = loadNext;

  useEffect(() => {
    void loadNext(true);
    return () => {
      const activeRequest = requestRef.current;
      requestRef.current = null;
      loadingRef.current = false;
      activeRequest?.abort();
    };
  }, [loadNext]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const visible = viewableItems
      .filter(token => token.isViewable && token.index !== null)
      .sort((left, right) => (right.index ?? -1) - (left.index ?? -1))[0];
    const visibleIndex = visible?.index ?? -1;
    const visibleItem = visible?.item as FeedReel | undefined;
    setActiveKey(visibleItem?.feedKey ?? null);

    // Begin loading when the active page is the third from last in the current batch.
    if (visibleIndex >= 0 && visibleIndex >= itemsRef.current.length - 3) {
      void loadNextRef.current();
    }
  }).current;

  const renderItem = useCallback(({ item }: ListRenderItemInfo<FeedReel>) => (
    <ReelPage reel={item} active={item.feedKey === activeKey} height={height} />
  ), [activeKey, height]);

  const getItemLayout = useCallback((_: ArrayLike<FeedReel> | null | undefined, index: number) => ({
    length: height,
    offset: height * index,
    index,
  }), [height]);

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={item => item.feedKey}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() => void loadNext()}
        onEndReachedThreshold={0.5}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        extraData={activeKey}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={loading ? (
          <View style={[styles.state, { height }]}><ActivityIndicator color="#fff" /></View>
        ) : (
          <View style={[styles.state, { height }]}>
            <Text style={styles.stateText}>{error || "No Reels are available yet."}</Text>
            {!!error && <Text style={styles.retry} onPress={() => void loadNext(true)}>Tap to retry</Text>}
          </View>
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color="#fff" /> : null}
      />
      {!!error && items.length > 0 && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry} onPress={() => void loadNext()}>Retry</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050708" },
  page: { width: "100%", backgroundColor: "#10171a", overflow: "hidden" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.08)" },
  details: { position: "absolute", left: 20, right: 84, bottom: 44 },
  creator: { color: "#fff", fontSize: 16, fontWeight: "700" },
  caption: { color: "#fff", fontSize: 14, lineHeight: 20, marginTop: 8 },
  state: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  stateText: { color: "#fff", fontSize: 15, textAlign: "center" },
  retry: { color: "#9bd3ff", fontSize: 14, fontWeight: "600", padding: 8 },
  footer: { padding: 16 },
  errorBanner: { position: "absolute", top: 48, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, paddingHorizontal: 12, backgroundColor: "#20282d" },
  errorText: { color: "#fff", flex: 1, fontSize: 12 },
});
