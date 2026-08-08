export const ECOMMERCE_PACKAGE_TYPES = ["detail", "listing", "amazonAplus"] as const;
export const ECOMMERCE_CONVERSION_DRIVERS = ["visual", "pain", "emotional"] as const;
export const ECOMMERCE_VISUAL_PRESETS = ["clean", "lifestyle", "luxury", "ugc"] as const;
export const ECOMMERCE_SCENE_ROLES = ["hero", "feature", "macro", "scene", "infographic", "specification", "comparison", "trust"] as const;
export const ECOMMERCE_TEMPLATE_MODES = ["auto", "manual"] as const;
export const ECOMMERCE_MARKET_MODES = ["domestic", "cross-border"] as const;
export const ECOMMERCE_CHANNELS = ["amazon", "shopify", "tiktokShop", "walmart", "etsy", "independent"] as const;
export const ECOMMERCE_MARKETS = ["us", "uk", "eu", "de", "jp", "ca", "au"] as const;
export const ECOMMERCE_COPY_LOCALES = ["en-US", "en-GB", "de-DE", "fr-FR", "ja-JP", "zh-CN"] as const;

export type EcommercePackageType = (typeof ECOMMERCE_PACKAGE_TYPES)[number];
export type EcommerceConversionDriver = (typeof ECOMMERCE_CONVERSION_DRIVERS)[number];
export type EcommerceVisualPreset = (typeof ECOMMERCE_VISUAL_PRESETS)[number];
export type EcommerceSceneRole = (typeof ECOMMERCE_SCENE_ROLES)[number];
export type EcommerceTemplateMode = (typeof ECOMMERCE_TEMPLATE_MODES)[number];
export type EcommerceMarketMode = (typeof ECOMMERCE_MARKET_MODES)[number];
export type EcommerceChannel = (typeof ECOMMERCE_CHANNELS)[number];
export type EcommerceMarket = (typeof ECOMMERCE_MARKETS)[number];
export type EcommerceCopyLocale = (typeof ECOMMERCE_COPY_LOCALES)[number];

const CHANNEL_INSTRUCTIONS: Record<EcommerceChannel, string> = {
    amazon: "Amazon listing and A+ context: mobile-first scan order, strong product clarity, restrained claims, modular image stack, and marketplace-safe visual hierarchy.",
    shopify: "Shopify PDP context: branded storytelling, flexible editorial modules, benefit-led flow, offer architecture, and a clear add-to-cart journey.",
    tiktokShop: "TikTok Shop context: fast thumb-stop hook, native social-commerce energy, creator-friendly scenes, short copy, and immediate product payoff.",
    walmart: "Walmart Marketplace context: practical value, clear specifications, accessible presentation, family usefulness, and restrained retail claims.",
    etsy: "Etsy context: craft, provenance, customization, gifting cues, tactile detail, and an authentic maker-led presentation.",
    independent: "Independent-store PDP context: brand-led storytelling, flexible conversion sequence, strong differentiation, trust, offer, and risk reversal.",
};

const MARKET_INSTRUCTIONS: Record<EcommerceMarket, string> = {
    us: "United States market; use US consumer language, USD when supplied, inches/feet and fl oz where relevant, and direct benefit-led copy.",
    uk: "United Kingdom market; use British English, GBP when supplied, metric-first measurements, and locally natural spelling and phrasing.",
    eu: "European Union market; use metric measurements, EUR when supplied, restrained claims, and culturally neutral pan-European imagery.",
    de: "Germany market; use metric measurements, EUR when supplied, precise factual copy, practical proof, and avoid vague superlatives.",
    jp: "Japan market; use metric measurements, JPY when supplied, concise respectful copy, careful hierarchy, and locally credible usage scenes.",
    ca: "Canada market; use Canadian context, CAD when supplied, metric-first measurements, and inclusive English copy unless another locale is selected.",
    au: "Australia market; use Australian English, AUD when supplied, metric measurements, and locally credible indoor or outdoor scenarios.",
};

const LOCALE_COPY_RULES: Record<EcommerceCopyLocale, string> = {
    "en-US": "Write natural English (US). Headline 3-7 words; supporting copy at most 18 words; direct, specific, and easy to scan on mobile.",
    "en-GB": "Write natural British English. Headline 3-7 words; supporting copy at most 18 words; preserve local spelling and tone.",
    "de-DE": "Write natural German for Germany. Keep the headline compact and the supporting line concise; prioritize clarity over literal translation.",
    "fr-FR": "Write natural French for France. Keep copy concise, idiomatic, benefit-led, and suitable for mobile PDP modules.",
    "ja-JP": "Write natural Japanese for Japan. Use a compact headline and one short supporting line with respectful, locally credible phrasing.",
    "zh-CN": "Write concise Simplified Chinese. Headline at most 14 characters and supporting copy at most 32 characters.",
};

export const ECOMMERCE_SCENE_TEMPLATES = [
    { id: "hero-image", name: "白底/纯色主图", group: "product", keywords: ["白底图", "主图", "hero image", "packshot", "商品主图"], instruction: "Clean white or solid background, centered product-first commercial packshot, soft diffused studio light, crisp silhouette and accurate materials.", variants: [["luxury", "高端奢侈品", "premium surface and restrained luxury lighting"], ["fresh", "清新自然", "fresh daylight and light natural accents"], ["tech", "科技感", "precise cool lighting and technical atmosphere"], ["color", "彩色背景", "bold solid brand-color background"]] },
    { id: "lifestyle-scene", name: "生活场景图", group: "product", keywords: ["场景图", "生活图", "lifestyle", "使用场景"], instruction: "Believable modern living environment, natural scale, warm inviting mood, window light and a clear product focal point.", variants: [["morning", "早晨清新", "fresh morning window light"], ["cozy", "温馨舒适", "cozy warm lived-in interior"], ["outdoor", "户外自然", "credible outdoor natural setting"], ["luxury", "奢华高端", "premium interior with restrained styling"]] },
    { id: "flat-lay", name: "平铺图", group: "product", keywords: ["平铺图", "flat lay", "俯拍", "top-down"], instruction: "Top-down flat lay with balanced spacing, curated complementary props, tactile surface and soft directional window light.", variants: [["luxury", "奢华仪式感", "ceremonial luxury props and premium surface"], ["minimal", "极简", "minimal props and generous negative space"], ["seasonal", "季节主题", "season-specific natural accents"]] },
    { id: "detail-macro", name: "细节微距", group: "product", keywords: ["细节图", "微距", "macro", "close-up"], instruction: "Extreme macro close-up of a verified material, component, finish or craft detail, with directional light revealing texture.", variants: [["texture", "材质纹理", "emphasize authentic material texture"], ["formula", "产品配方", "show verified formula or ingredient texture"], ["craftsmanship", "工艺细节", "show precise manufacturing or craft detail"]], antiAi: "Preserve irregular micro-texture, subtle wear, realistic reflections and optical depth; avoid plastic smoothness or invented details." },
    { id: "poster-banner", name: "海报/Banner", group: "marketing", keywords: ["海报", "poster", "banner", "促销", "promotion"], instruction: "Campaign poster composition with a dominant product, clear visual hierarchy and copy-safe zones for headline, offer and call to action.", variants: [["luxury", "高端奢华", "restrained premium campaign"], ["minimal", "极简现代", "minimal modern campaign"], ["festive", "节日主题", "festive campaign accents"], ["flash-sale", "限时折扣", "urgent high-contrast sale layout"]] },
    { id: "social-media", name: "社交媒体", group: "marketing", keywords: ["社交媒体", "小红书", "instagram", "tiktok", "种草"], instruction: "Native social post composition, phone-camera perspective, slightly off-center framing, natural ambient light and space for platform-native overlays.", variants: [["xiaohongshu", "小红书种草", "Chinese lifestyle recommendation post"], ["instagram", "Instagram 帖子", "editorial square social post"], ["tiktok", "TikTok/Reels 封面", "vertical short-video cover"]], antiAi: "Use a named phone-camera feel, slight framing imperfection, mixed ambient light, subtle sensor noise and a believable lived-in environment." },
    { id: "ugc-style", name: "UGC 买家秀", group: "marketing", keywords: ["ugc", "买家秀", "真实用户", "grwm", "用户生成"], instruction: "Authentic user snapshot, casual phone-camera framing, real lived-in space, uneven warm light and non-professional composition.", variants: [["mirror-selfie", "浴室镜自拍", "bathroom mirror selfie with natural marks"], ["ccd-retro", "CCD 复古胶片", "2005 CCD direct-flash snapshot"], ["grwm", "GRWM", "morning-routine video thumbnail"], ["unboxing", "开箱分享", "casual unboxing on bed or desk"]], antiAi: "Visible pores and material flaws, shadow noise, warm color cast, off-center or tilted framing, slight highlight clipping and a candid NOT professional look." },
    { id: "model-showcase", name: "模特展示", group: "marketing", keywords: ["模特", "model", "人物展示", "真人展示"], instruction: "Real-camera model showcase with natural pose, believable skin and fabric behavior, and clear product interaction.", variants: [["beauty-closeup", "美妆特写", "close beauty framing with real skin"], ["fashion-full", "时尚全身", "full-body fashion view"], ["candid", "自然抓拍", "candid in-between moment"]], antiAi: "Keep pores, under-eye texture, natural asymmetry, small expression imperfections and realistic fabric folds; never airbrushed or flawless." },
    { id: "before-after", name: "使用前后对比", group: "information", keywords: ["对比", "before after", "前后", "效果对比"], instruction: "Clear side-by-side or split comparison based only on supplied evidence, with identical framing and blank callout areas for independent copy.", variants: [["clinical", "临床数据", "clean evidence-led comparison"], ["cinematic", "电影感蜕变", "cinematic transformation contrast"], ["simple", "简洁信息图", "minimal split infographic"]] },
    { id: "packaging", name: "包装设计", group: "information", keywords: ["包装", "packaging", "礼盒", "gift box", "开箱"], instruction: "Complete packaging presentation with product, box and verified inclusions clearly arranged, tactile surfaces and controlled reflective lighting.", variants: [["luxury-gift", "奢华礼盒", "premium gift-box presentation"], ["minimal-eco", "极简环保", "minimal recyclable packaging"], ["unboxing", "开箱体验", "layered unboxing sequence"]] },
    { id: "infographic", name: "信息图/A+", group: "information", keywords: ["信息图", "infographic", "a+", "详情页", "卖点图"], instruction: "Structured feature-grid or story-flow base with product focus, blank callout zones, restrained icons and connectors; no rendered text.", variants: [["amazon-a-plus", "Amazon A+", "modular Amazon A+ composition"], ["feature-grid", "卖点网格", "scannable feature grid"], ["story-flow", "故事线信息流", "vertical story-flow composition"]] },
    { id: "creative-concept", name: "创意概念广告", group: "information", keywords: ["创意图", "概念图", "creative", "concept art", "品牌广告"], instruction: "Bold conceptual product advertising with one unexpected visual metaphor, dramatic effects and strong product recognition.", variants: [["splash-dynamic", "飞溅动态", "dynamic splash and motion effect"], ["surreal", "超现实概念", "surreal but product-legible concept"], ["minimal-art", "极简艺术", "single minimal visual metaphor"]] },
    { id: "size-spec", name: "尺寸规格图", group: "information", keywords: ["尺寸", "规格", "使用步骤", "dimension", "how to use"], instruction: "Technical specification or usage-step layout with accurate product scale and blank annotation zones; only visualize supplied measurements.", variants: [["premium-editorial", "高端杂志", "premium editorial specification"], ["technical", "技术规格", "precise technical diagram"], ["ritual-guide", "使用仪式", "step-by-step usage ritual"]] },
    { id: "multi-product", name: "多产品套装", group: "information", keywords: ["套装", "组合", "多产品", "bundle", "gift set"], instruction: "Show every supplied product clearly with even spacing, no overlap, consistent scale logic and a clean bundle presentation.", variants: [["gift-set", "礼盒套装", "gift-set arrangement"], ["routine-set", "使用程序套装", "ordered routine sequence"], ["lineup", "产品线排列", "catalog product lineup"]] },
    { id: "livestream", name: "直播间场景", group: "people", keywords: ["直播", "livestream", "直播间", "带货"], instruction: "Believable commerce livestream frame with a host naturally demonstrating the product, real home-studio lighting and blank zones for later UI overlays.", variants: [["douyin", "抖音直播", "Douyin-style vertical livestream"], ["taobao", "淘宝直播", "Taobao-style product demo"], ["setup", "直播间布景", "wide view of a credible livestream setup"]], antiAi: "Use realistic ring-light catchlights, mixed warm overhead light, natural skin texture, imperfect hand pose and a lived-in streaming setup." },
    { id: "try-on-virtual", name: "虚拟试穿", group: "people", keywords: ["试穿", "融入", "try on", "场景融合"], instruction: "Integrate the unchanged product naturally into a matching person or environment with accurate scale, contact, perspective and material behavior.", variants: [["interior-luxury", "奢华室内", "premium interior integration"], ["outdoor-natural", "户外自然", "natural outdoor integration"], ["studio-editorial", "棚拍编辑", "controlled editorial studio"]] },
    { id: "exploded-view", name: "技术拆解图", group: "technical", keywords: ["拆解图", "爆炸图", "exploded view", "内部结构", "teardown"], instruction: "Precise exploded-view technical illustration with verified components, consistent axis, increasing spacing and blank leader-line labels.", variants: [["blueprint", "蓝图", "technical blueprint"], ["minimal", "极简白底", "minimal white technical view"], ["apple-style", "Apple 式拆解", "precision industrial teardown"], ["editorial", "杂志编辑", "editorial technical spread"]] },
    { id: "ghost-mannequin", name: "隐形模特", group: "technical", keywords: ["隐形模特", "ghost mannequin", "3d服装", "无人模特"], instruction: "Natural three-dimensional garment form on an invisible mannequin, accurate shoulder, waist and fabric structure, clean studio lighting.", variants: [["white-clean", "纯白干净", "clean white catalog"], ["editorial", "杂志风格", "editorial garment view"], ["editorial-detail", "内衬细节", "open detail showing verified lining"], ["lifestyle", "环境道具", "subtle lifestyle props"]] },
    { id: "multi-angle-grid", name: "多角度网格", group: "technical", keywords: ["多角度", "网格", "grid", "多面", "colorway"], instruction: "Consistent 2x2 or 3x3 product grid showing truthful angles or supplied colorways with identical lighting, scale and clean separators.", variants: [["angle-view", "多角度视角", "front side rear and top views"], ["colorway", "多配色展示", "supplied color variants"], ["feature-grid", "功能标注网格", "angles with blank feature callouts"], ["comparison", "对比网格", "verified side-by-side grid"]] },
    { id: "magazine-editorial", name: "杂志封面", group: "people", keywords: ["杂志", "封面", "editorial", "magazine cover", "时尚大片"], instruction: "High-fashion editorial product story with professional model direction, controlled beauty lighting and blank masthead and cover-line zones.", variants: [["beauty-cover", "美妆封面", "beauty magazine cover"], ["fashion-cover", "时尚封面", "full fashion cover"], ["fragrance-editorial", "香水大片", "fragrance editorial still life"], ["minimal-editorial", "极简内页", "minimal editorial spread"]], antiAi: "Retain believable skin, hair flyaways, garment creases, lens depth and asymmetric expression; avoid waxy faces and over-retouching." },
    { id: "seasonal-campaign", name: "季节营销", group: "campaign", keywords: ["季节", "四季", "seasonal", "春夏秋冬", "campaign"], instruction: "Coordinated seasonal campaign grid with identical product angle and scale while environment, color and natural accents change by theme.", variants: [["four-seasons", "经典四季", "spring summer autumn winter grid"], ["holiday-series", "节日系列", "coordinated holiday series"], ["day-to-night", "日夜变体", "day to night progression"], ["travel-series", "旅行主题", "destination campaign series"]] },
    { id: "luxury-atmospherics", name: "奢华氛围", group: "campaign", keywords: ["奢华", "氛围", "烟雾", "luxury", "premium"], instruction: "Luxury product still life with premium reflective surface, sculpted rim light and restrained atmospheric elements selected to support the product.", variants: [["floral-dream", "花卉梦幻", "restrained floral atmosphere"], ["smoke-mystique", "烟雾神秘", "controlled smoke atmosphere"], ["golden-luxe", "金色奢华", "warm gold premium light"], ["ice-crystal", "冰晶冷冽", "cold crystal atmosphere"]] },
    { id: "device-mockup", name: "设备模型", group: "campaign", keywords: ["mockup", "saas", "app", "设备展示", "ui展示"], instruction: "Realistic phone or laptop mockup in a modern workspace with accurate screen perspective, glare and a clean supplied interface area.", variants: [["single-laptop", "单笔记本", "single laptop hero"], ["multi-device", "多设备联动", "coordinated device ecosystem"], ["phone-only", "手机展示", "single phone mockup"], ["office-lifestyle", "办公场景", "lived-in modern workspace"]] },
    { id: "storefront", name: "店铺门面", group: "campaign", keywords: ["店铺", "门面", "storefront", "空间摄影", "零售空间"], instruction: "Architectural retail photography with legible storefront form or interior zoning, accurate wide-angle perspective and believable practical lighting.", variants: [["exterior", "门面外观", "golden-hour storefront exterior"], ["interior", "室内空间", "wide retail interior"], ["corner-detail", "角落细节", "material and display detail"], ["aerial-plan", "俯视平面", "top-down spatial plan"]] },
    { id: "sports-campaign", name: "运动广告", group: "campaign", keywords: ["运动", "健身", "sports", "fitness", "运动鞋", "运动服"], instruction: "Dynamic sports advertising with the product as the hero, strong directional lighting, motion energy and blank zones for bold campaign copy.", variants: [["product-hero", "产品主视觉", "floating dynamic product hero"], ["athlete-action", "运动员动态", "athlete mid-action"], ["triptych", "三联画", "detail action and hero triptych"], ["gym-power", "健身力量感", "powerful gym campaign"]] },
] as const;

export type EcommerceSceneTemplateId = (typeof ECOMMERCE_SCENE_TEMPLATES)[number]["id"];

const DEFAULT_TEMPLATE_BY_ROLE: Record<EcommerceSceneRole, EcommerceSceneTemplateId> = {
    hero: "hero-image",
    feature: "infographic",
    macro: "detail-macro",
    scene: "lifestyle-scene",
    infographic: "infographic",
    specification: "size-spec",
    comparison: "before-after",
    trust: "packaging",
};

const VISUAL_PRESET_INSTRUCTIONS: Record<EcommerceVisualPreset, string> = {
    clean: "Clean premium commercial photography, restrained neutral palette, crisp softbox lighting, precise spacing, and a quiet product-first layout.",
    lifestyle: "Natural lifestyle campaign, believable lived-in environment, warm daylight, tactile materials, and candid but carefully directed composition.",
    luxury: "Refined luxury editorial, deep controlled contrast, premium surfaces, sculpted lighting, generous negative space, and restrained accents selected from the product itself.",
    ugc: "Credible social-commerce realism, phone-camera perspective, slightly imperfect framing, natural ambient light, subtle texture and noise, never glossy or synthetic.",
};

const PACKAGE_SEQUENCE_HINTS: Record<EcommercePackageType, string> = {
    detail: "Build a continuous PDP story: hook, benefits, mechanism or material, usage, proof, and closing action.",
    listing: "Prioritize a marketplace listing set: clean hero, multi-angle or feature views, scale/specification, usage, comparison, and trust.",
    amazonAplus: "Prioritize modular A+ content: brand story, feature grid, material or mechanism, lifestyle use, comparison, proof, and closing module.",
};

const CONVERSION_HINTS: Record<EcommerceConversionDriver, string> = {
    visual: "Lead with desirability, form, finish, material, color, and premium product presence before supporting facts.",
    pain: "Lead with a real customer problem, show the product mechanism and benefit, then support the claim with verified evidence.",
    emotional: "Lead with the desired identity or life moment, then connect product benefits and proof to that emotional outcome.",
};

const SCENE_ROLE_INSTRUCTIONS: Record<EcommerceSceneRole, string> = {
    hero: "Hero image: one dominant product view, clear silhouette, premium lighting, 55-70% product occupancy, and intentional copy-safe negative space.",
    feature: "Feature image: one verified benefit expressed through product-led composition and simple visual anchors; reserve clean zones for the independent copy layer.",
    macro: "Detail macro: show a real material, finish, component, texture, seam, control, or manufacturing detail visible in the reference or verified product information.",
    scene: "Lifestyle scene: place the unchanged product in one believable use context with natural scale, human context only when useful, and no competing product subject.",
    infographic: "Infographic base: create a structured feature-grid or story-flow background with restrained dividers, icons or connectors, but render no letters, numbers, labels, or fake UI.",
    specification: "Specification or scale image: show truthful proportions, parts, steps, dimensions, or multi-angle structure only when supported; leave measured callout zones blank for later copy.",
    comparison: "Comparison image: use a clear before/after or side-by-side composition based only on verified differences; do not invent competitor products, metrics, or outcomes.",
    trust: "Trust or closing image: reinforce verified material, warranty, testing, packaging, review, or service evidence; without evidence, use a clean confidence-building product close instead of badges.",
};

export function buildCampaignStyleLock(visualPreset: EcommerceVisualPreset = "clean", ratio = "3:4", styleNotes = "") {
    const normalizedStyleNotes = styleNotes?.trim() || "";
    return [
        "CAMPAIGN STYLE LOCK - repeat unchanged across every section:",
        VISUAL_PRESET_INSTRUCTIONS[visualPreset],
        `Canvas ratio ${ratio}. Keep one color temperature, background family, lighting direction, product scale logic, spacing rhythm, icon language, and transition rhythm across the full set.`,
        "The referenced product identity is immutable: preserve silhouette, logo, color, finish, material, component placement, and proportions. The product is the only commercial subject.",
        "Do not render text, letters, numbers, prices, badges, watermarks, fake interfaces, or logos not present on the product. Reserve intentional safe areas for a separate browser-rendered copy layer.",
        normalizedStyleNotes ? `User brand rules: ${normalizedStyleNotes}` : "Derive restrained accent colors and material cues from the reference product.",
    ].join("\n");
}

export function buildEcommerceSectionPrompt(input: {
    styleLock: string;
    role: EcommerceSceneRole;
    templateId: EcommerceSceneTemplateId;
    variantId: string;
    antiAiEnabled: boolean;
    marketBrief: string;
    prompt: string;
    productInfo: string;
    proofPoints: string;
    ratio: string;
}) {
    const template = getEcommerceSceneTemplate(input.templateId);
    const variant = template.variants.find(([id]) => id === input.variantId);
    const antiAi = input.antiAiEnabled && "antiAi" in template ? template.antiAi : "";
    return [
        input.styleLock,
        `\nSECTION ROLE - ${input.role}: ${SCENE_ROLE_INSTRUCTIONS[input.role]}`,
        `\nVISUAL SCENE TEMPLATE - ${template.id} / ${template.name}:\n${template.instruction}`,
        variant ? `Selected variant - ${variant[1]}: ${variant[2]}` : "Select the most suitable built-in variant for this section without changing the scene template.",
        antiAi ? `Authenticity treatment: ${antiAi}` : "",
        input.marketBrief ? `\nCROSS-BORDER MARKET LOCK:\n${input.marketBrief}` : "",
        `\nSECTION DIRECTION:\n${input.prompt.trim()}`,
        `\nVERIFIED PRODUCT INFORMATION:\n${input.productInfo.trim()}`,
        input.proofPoints.trim() ? `\nVERIFIED PROOF ASSETS:\n${input.proofPoints.trim()}` : "\nVERIFIED PROOF ASSETS:\nNone supplied. Do not imply certification, test results, ratings, warranties, dimensions, performance metrics, or quantified outcomes.",
        `\nOUTPUT: one ${input.ratio} e-commerce image. Keep top and bottom transitions calm enough for vertical stitching.`,
    ].join("\n");
}

export function getPackageSequenceHint(value: EcommercePackageType) {
    return PACKAGE_SEQUENCE_HINTS[value];
}

export function getConversionHint(value: EcommerceConversionDriver) {
    return CONVERSION_HINTS[value];
}

export function getSceneRoleLibrary() {
    return ECOMMERCE_SCENE_ROLES.map((role) => `${role}: ${SCENE_ROLE_INSTRUCTIONS[role]}`).join("\n");
}

export function getEcommerceSceneTemplate(id: string) {
    return ECOMMERCE_SCENE_TEMPLATES.find((template) => template.id === id) || ECOMMERCE_SCENE_TEMPLATES[0];
}

export function getSceneTemplateLabel(id: string, variantId = "") {
    const template = getEcommerceSceneTemplate(id);
    const variant = template.variants.find(([value]) => value === variantId);
    return variant ? `${template.name} · ${variant[1]}` : template.name;
}

export function getDefaultTemplateForRole(role: EcommerceSceneRole) {
    return DEFAULT_TEMPLATE_BY_ROLE[role];
}

export function matchEcommerceSceneTemplate(value: string, role: EcommerceSceneRole = "hero") {
    const normalized = value.toLowerCase();
    return ECOMMERCE_SCENE_TEMPLATES.find((template) => template.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))?.id || DEFAULT_TEMPLATE_BY_ROLE[role];
}

export function getSceneTemplateCatalog() {
    return ECOMMERCE_SCENE_TEMPLATES.map((template) => `${template.id}: ${template.name}; keywords=${template.keywords.join(",")}; variants=${template.variants.map(([id, label]) => `${id}(${label})`).join(",")}`).join("\n");
}

export function buildCrossBorderMarketBrief(input: {
    channel?: EcommerceChannel;
    market?: EcommerceMarket;
    copyLocale?: EcommerceCopyLocale;
    audienceProfile?: string;
    offerDetails?: string;
    complianceEnabled?: boolean;
}) {
    const channel = input.channel || "amazon";
    const market = input.market || "us";
    const copyLocale = input.copyLocale || "en-US";
    const audienceProfile = input.audienceProfile?.trim() || "";
    const offerDetails = input.offerDetails?.trim() || "";
    return [
        `TARGET CHANNEL: ${CHANNEL_INSTRUCTIONS[channel]}`,
        `TARGET MARKET: ${MARKET_INSTRUCTIONS[market]}`,
        `COPY LOCALE: ${LOCALE_COPY_RULES[copyLocale]}`,
        audienceProfile ? `TARGET BUYER AND PURCHASE CONTEXT: ${audienceProfile}` : "TARGET BUYER AND PURCHASE CONTEXT: Infer a conservative category-fit buyer context without inventing demographic facts.",
        offerDetails ? `VERIFIED OFFER AND CTA ASSETS: ${offerDetails}` : "VERIFIED OFFER AND CTA ASSETS: None supplied. Use a soft product-led close; do not invent price, discount, shipping, bundle, warranty, urgency, or guarantee.",
        input.complianceEnabled
            ? "PLATFORM COMPLIANCE REVIEW: Enabled. Use only substantiated claims and supplied reviews, certifications, measurements, comparisons, guarantees, platform marks, and third-party assets. Replace unsupported proof with a neutral proof placeholder or a functional scene. Avoid medical implications, absolutes, misleading before/after claims, fake platform UI, and unverifiable superiority."
            : "PLATFORM COMPLIANCE REVIEW: Not requested. The basic truthfulness boundary still applies: never invent hard facts, reviews, certifications, measurements, prices, guarantees, platform marks, or named competitor claims.",
    ].join("\n");
}
