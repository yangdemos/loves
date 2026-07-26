// ============================================
// Our Love Story - Data Configuration
// ============================================

const LOVE_DATA = {
    // Relationship dates (adjust these!)
    startDate: new Date('2024-01-15'),
    meetDate: '2024.01.15',

    // Love letter content (typewriter effect)
    letter: [
        "从我们相遇的那一刻起，宇宙中有什么东西发生了改变。仿佛星星一直在悄然策划，精心安排每一个细节——将我们引向那个特定的瞬间，那交汇的目光，那第一次让人感觉像回家一样的交谈。",
        "在你身上，我找到的不仅是伴侣，更是一面映照出最好自己的镜子。你让我明白了无条件去爱、无限去成长、无畏去梦想的意义。",
        "知道你在这个世界上的每一天，每一个日出都变得更加温暖。每一次日落都更加美丽，因为我可以和你一起分享——即使距离将我们分隔，我的心已经学会了跨越任何距离。",
        "这是我们的故事，一天一天写就。而它才刚刚开始。"
    ],

    // Globe locations with coordinates (lat, lng), photo placeholders, and memories
    locations: [
        {
            id: 'beijing',
            name: '北京',
            country: '中国',
            lat: 39.9042,
            lng: 116.4074,
            color: '#e8c4b8',
            date: '2024.01',
            description: '一切开始的地方。这座城市见证了我们第一次问候，第一次手牵手走过古老的胡同，第一次在拥挤的街头目光相遇。',
            heroImage: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&q=80',
            photos: [
                'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80',
                'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600&q=80',
                'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=600&q=80',
                'https://images.unsplash.com/photo-1578326457398-2aef5f1f3cd0?w=600&q=80',
                'https://images.unsplash.com/photo-1560089166-5d0e6c3e3f7b?w=600&q=80',
                'https://images.unsplash.com/photo-1581481616316-eef6e6f7d82e?w=600&q=80'
            ]
        },
        {
            id: 'shanghai',
            name: '上海',
            country: '中国',
            lat: 31.2304,
            lng: 121.4737,
            color: '#c9a96e',
            date: '2024.04',
            description: '夜晚的外滩，霓虹灯影在水面上舞动。上海给了我们第一次共同的旅行，每一个街角都像电影里的场景。',
            heroImage: 'https://images.unsplash.com/photo-1537531383490-6c1136db94f0?w=1200&q=80',
            photos: [
                'https://images.unsplash.com/photo-1537531383490-6c1136db94f0?w=600&q=80',
                'https://images.unsplash.com/photo-1541103555897-04e0c7e4e646?w=600&q=80',
                'https://images.unsplash.com/photo-1569050467447-ce54b3bb37ad?w=600&q=80',
                'https://images.unsplash.com/photo-1559635222-cb1ce5bb07ba?w=600&q=80',
                'https://images.unsplash.com/photo-1552223715-8acab8e457d6?w=600&q=80',
                'https://images.unsplash.com/photo-1577954762025-4b26a3baaf72?w=600&q=80'
            ]
        },
        {
            id: 'paris',
            name: 'Paris',
            country: '法国',
            lat: 48.8566,
            lng: 2.3522,
            color: '#e8a0a0',
            date: '2024.07',
            description: '爱情之城名副其实。从午夜闪烁的埃菲尔铁塔到蒙马特咖啡馆的宁静午后，巴黎将我们拥入它浪漫的怀抱。',
            heroImage: 'https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=1200&q=80',
            photos: [
                'https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=600&q=80',
                'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80',
                'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&q=80',
                'https://images.unsplash.com/photo-1509439581779-6298f75bf6e5?w=600&q=80',
                'https://images.unsplash.com/photo-1549144511-f099e773c147?w=600&q=80',
                'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=80'
            ]
        },
        {
            id: 'tokyo',
            name: 'Tokyo',
            country: '日本',
            lat: 35.6762,
            lng: 139.6503,
            color: '#d4a89a',
            date: '2024.10',
            description: '春天的樱花，冬天的温暖拉面。东京是一场穿越霓虹街道和宁静庙宇的冒险——完美地映照了我们：充满活力而又平和。',
            heroImage: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1200&q=80',
            photos: [
                'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=600&q=80',
                'https://images.unsplash.com/photo-1549693578-d683be217e58?w=600&q=80',
                'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80',
                'https://images.unsplash.com/photo-1551641506-ee5bf4cb45f1?w=600&q=80',
                'https://images.unsplash.com/photo-1557876188-3875a2d84c0c?w=600&q=80',
                'https://images.unsplash.com/photo-1580640107396-0f7e8d8a0d0a?w=600&q=80'
            ]
        },
        {
            id: 'bali',
            name: 'Bali',
            country: '印度尼西亚',
            lat: -8.3405,
            lng: 115.0920,
            color: '#c9a96e',
            date: '2025.02',
            description: '热带天堂与灵魂的交融。巴厘岛是我们放慢脚步、一起呼吸、更深地相爱的地方——在梯田间、在海洋日落中、在海岛生活的节奏里。',
            heroImage: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&q=80',
            photos: [
                'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=600&q=80',
                'https://images.unsplash.com/photo-1544644181-1484b3f6b1e8?w=600&q=80',
                'https://images.unsplash.com/photo-1559622214-f8a0320960b0?w=600&q=80',
                'https://images.unsplash.com/photo-1529841780444-295d65e8fcc4?w=600&q=80',
                'https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=600&q=80',
                'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80'
            ]
        }
    ],

    // Gallery photos (placeholders)
    gallery: [
        { src: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&q=80', label: '第一次约会' },
        { src: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?w=600&q=80', label: '日落漫步' },
        { src: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=600&q=80', label: '城市灯火' },
        { src: 'https://images.unsplash.com/photo-1474552226712-ac0f0961a954?w=600&q=80', label: '海滩日' },
        { src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80', label: '冒险' },
        { src: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&q=80', label: '温馨夜晚' },
        { src: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80', label: '晚餐约会' },
        { src: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&q=80', label: '在一起' }
    ]
};

// Calculate time since start date
function calculateTimeTogether() {
    const now = new Date();
    const start = LOVE_DATA.startDate;
    const diff = now - start;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    const remainingMonths = months % 12;

    return { days, months, years, remainingMonths };
}
