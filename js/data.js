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

    // Globe locations with coordinates (lat, lng), local photos, and memories
    locations: [
        {
            id: 'auckland',
            name: '奥克兰',
            country: '新西兰',
            lat: -36.8485,
            lng: 174.7633,
            color: '#4a9eff',
            date: '2024.10',
            description: '千帆之都——天空塔在暮色中点亮城市的天际线，海港大桥横跨碧蓝的怀特马塔港，独树山上的绿茵诉说着毛利与殖民的历史交响。从使命湾的沙滩到伊甸山的火山口，奥克兰用它的山海与光影，装点了我们旅途中最明亮的坐标。',
            heroImage: 'https://images.unsplash.com/photo-1677825949600-e72d53c2fda0?w=1600&q=80',
            photos: [
                'https://images.unsplash.com/photo-1700731711823-814c1a673fa6?w=800&q=80',
                'https://images.unsplash.com/photo-1718398892690-41088e4dfd61?w=800&q=80',
                'https://images.unsplash.com/photo-1745550663491-6cec967ce6e9?w=800&q=80'
            ]
        },
        {
            id: 'rotorua',
            name: '罗托鲁阿',
            country: '新西兰',
            lat: -38.1368,
            lng: 176.2497,
            color: '#c9a96e',
            date: '2024.11',
            description: '地热之城——硫磺温泉的蒸汽在晨曦中袅袅升腾，香槟池的斑斓色彩如同大地的调色盘，彩虹泉的清澈溪流中鳟鱼悠游。在这片被地热温暖的土地上，每一次呼吸都带着大地的温度，让我们的记忆也染上了硫磺味的暖意。',
            heroImage: 'https://images.unsplash.com/photo-1693887245601-c43ee246efd8?w=1600&q=80',
            photos: [
                'https://images.unsplash.com/photo-1693887245601-c43ee246efd8?w=800&q=80',
                'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80',
                'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&q=80'
            ]
        },
        {
            id: 'xian',
            name: '西安',
            country: '中国',
            lat: 34.3416,
            lng: 108.9398,
            color: '#e8b4b4',
            date: '2025.01',
            description: '十三朝古都——兵马俑的阵列在黄土之下沉睡了两千年，古城墙的砖石见证了帝国的兴衰更迭，钟鼓楼的晨钟暮鼓依然回荡在街巷之间。回民街的烟火气里，肉夹馍与biangbiang面的香气诉说着这座城市生生不息的日常。',
            heroImage: 'https://images.unsplash.com/photo-1565344304100-2931794c111f?w=1600&q=80',
            photos: [
                'https://images.unsplash.com/photo-1773633495448-69b3fa83efd4?w=800&q=80',
                'https://images.unsplash.com/photo-1716637116193-7b12401aa343?w=800&q=80',
                'https://images.unsplash.com/photo-1665849189343-c302695244a4?w=800&q=80'
            ]
        }
    ],

    // Gallery photos (placeholders)
    gallery: [
        { src: 'assets/photos/Intimate/微信图片_20260729000314_12_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000321_13_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000337_16_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000346_17_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000348_18_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000356_19_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000405_20_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000414_21_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000422_22_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000425_23_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000511_27_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000524_28_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000607_30_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000610_31_1.jpg' },
        { src: 'assets/photos/Intimate/微信图片_20260729000622_32_1.jpg' }
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
