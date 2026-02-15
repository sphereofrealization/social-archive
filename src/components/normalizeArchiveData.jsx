// Normalize archive data from both old and new extraction formats
export function normalizeArchiveAnalysis(data) {
  if (!data) {
    return {
      photos: [],
      videos: [],
      postFiles: { html: [], json: [] },
      friendFiles: { html: [], json: [] },
      messageThreads: [],
      commentFiles: { html: [], json: [] },
      likeFiles: { html: [], json: [] },
      groupFiles: { html: [], json: [] },
      reviewFiles: { html: [], json: [] },
      marketplaceFiles: { html: [], json: [] },
      eventFiles: { html: [], json: [] },
      reelFiles: { html: [], json: [] },
      checkinFiles: { html: [], json: [] },
      counts: {
        photos: 0,
        videos: 0,
        posts: 0,
        friends: 0,
        chats: 0,
        comments: 0,
        likes: 0,
        groups: 0,
        reviews: 0,
        marketplace: 0,
        events: 0,
        reels: 0,
        checkins: 0
      },
      isStreaming: false,
      buildId: null
    };
  }

  const isStreaming = data.mode === "streaming" || data.isStreaming === true;
  const index = data.index || {};
  const counts = data.counts || {};

  // Photos and videos (both formats)
  const photos = (index.photos && Array.isArray(index.photos)) ? index.photos : (Array.isArray(data.photos) ? data.photos : []);
  const videos = (index.videos && Array.isArray(index.videos)) ? index.videos : (Array.isArray(data.videos) ? data.videos : []);

  // Post files
  const postFiles = {
    html: (index.posts?.html && Array.isArray(index.posts.html)) ? index.posts.html : [],
    json: (index.posts?.json && Array.isArray(index.posts.json)) ? index.posts.json : []
  };

  // Friend files
  const friendFiles = {
    html: (index.friends?.html && Array.isArray(index.friends.html)) ? index.friends.html : [],
    json: (index.friends?.json && Array.isArray(index.friends.json)) ? index.friends.json : []
  };

  // Message threads
  const messageThreads = (index.messages?.threads && Array.isArray(index.messages.threads)) ? index.messages.threads : [];

  // Comment files
  const commentFiles = {
    html: (index.comments?.html && Array.isArray(index.comments.html)) ? index.comments.html : [],
    json: (index.comments?.json && Array.isArray(index.comments.json)) ? index.comments.json : []
  };

  // Like files
  const likeFiles = {
    html: (index.likes?.html && Array.isArray(index.likes.html)) ? index.likes.html : [],
    json: (index.likes?.json && Array.isArray(index.likes.json)) ? index.likes.json : []
  };

  // Group files
  const groupFiles = {
    html: (index.groups?.html && Array.isArray(index.groups.html)) ? index.groups.html : [],
    json: (index.groups?.json && Array.isArray(index.groups.json)) ? index.groups.json : []
  };

  // Review files
  const reviewFiles = {
    html: (index.reviews?.html && Array.isArray(index.reviews.html)) ? index.reviews.html : [],
    json: (index.reviews?.json && Array.isArray(index.reviews.json)) ? index.reviews.json : []
  };

  // Marketplace files
  const marketplaceFiles = {
    html: (index.marketplace?.html && Array.isArray(index.marketplace.html)) ? index.marketplace.html : [],
    json: (index.marketplace?.json && Array.isArray(index.marketplace.json)) ? index.marketplace.json : []
  };

  // Event files
  const eventFiles = {
    html: (index.events?.html && Array.isArray(index.events.html)) ? index.events.html : [],
    json: (index.events?.json && Array.isArray(index.events.json)) ? index.events.json : []
  };

  // Reel files
  const reelFiles = {
    html: (index.reels?.html && Array.isArray(index.reels.html)) ? index.reels.html : [],
    json: (index.reels?.json && Array.isArray(index.reels.json)) ? index.reels.json : []
  };

  // Checkin files
  const checkinFiles = {
    html: (index.checkins?.html && Array.isArray(index.checkins.html)) ? index.checkins.html : [],
    json: (index.checkins?.json && Array.isArray(index.checkins.json)) ? index.checkins.json : []
  };

  // Normalize counts - use file counts if available, fallback to parsed counts
  const normalizedCounts = {
    photos: photos.length,
    videos: videos.length,
    posts: postFiles.html.length + postFiles.json.length || (counts.postsJsonFiles || 0) + (counts.postsHtmlFiles || 0),
    friends: friendFiles.html.length + friendFiles.json.length || (counts.friendsJsonFiles || 0) + (counts.friendsHtmlFiles || 0),
    chats: messageThreads.length || (counts.messageThreads || 0),
    comments: commentFiles.html.length + commentFiles.json.length || (counts.commentsJsonFiles || 0) + (counts.commentsHtmlFiles || 0),
    likes: likeFiles.html.length + likeFiles.json.length || (counts.likesJsonFiles || 0) + (counts.likesHtmlFiles || 0),
    groups: groupFiles.html.length + groupFiles.json.length || (counts.groupsJsonFiles || 0) + (counts.groupsHtmlFiles || 0),
    reviews: reviewFiles.html.length + reviewFiles.json.length || (counts.reviewsJsonFiles || 0) + (counts.reviewsHtmlFiles || 0),
    marketplace: marketplaceFiles.html.length + marketplaceFiles.json.length || (counts.marketplaceJsonFiles || 0) + (counts.marketplaceHtmlFiles || 0),
    events: eventFiles.html.length + eventFiles.json.length || (counts.eventsJsonFiles || 0) + (counts.eventsHtmlFiles || 0),
    reels: reelFiles.html.length + reelFiles.json.length || (counts.reelsJsonFiles || 0) + (counts.reelsHtmlFiles || 0),
    checkins: checkinFiles.html.length + checkinFiles.json.length || (counts.checkinsJsonFiles || 0) + (counts.checkinsHtmlFiles || 0)
  };

  return {
    photos,
    videos,
    postFiles,
    friendFiles,
    messageThreads,
    commentFiles,
    likeFiles,
    groupFiles,
    reviewFiles,
    marketplaceFiles,
    eventFiles,
    reelFiles,
    checkinFiles,
    counts: normalizedCounts,
    isStreaming,
    buildId: data.buildId,
    mode: data.mode
  };
}