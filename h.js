// GraphQLクエリ（必要に応じて内容を補完してください）
const GRAPHQL_QUERY = `
  query enWorksQuery($author: String!, $afterID: ID) {
    user(name: $author) {
      attributedPages(
        sort: {
          key: CREATED_AT
          order: DESC
        }
        filter: { wikidotInfo: { category: { eq: "_default" } } },
        first: 50
        after: $afterID
      ) {
        edges {
          node {
            url
            attributions {
              user {
                name
              }
            }
            wikidotInfo {
              title
              rating
              createdAt
            }
            translations {
              url
              attributions {
                user {
                  name
                }
              }
              wikidotInfo {
                title
                rating
                createdAt
              }
            }
            translationOf {
              url
              attributions {
                user {
                  name
                }
              }
              wikidotInfo {
                title
                rating
                createdAt
              }
              translations {
                url
                attributions {
                  user {
                    name
                  }
                }
                wikidotInfo {
                  title
                  rating
                  createdAt
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

// URLパターンと対応するブランチの定義
const WIKI_REGEXES = [
  { pattern: /^http:\/\/scp-wiki\./, branch: "EN"},
  { pattern: /^http:\/\/wanderers-library\./, branch: "WL"},
  { pattern: /^http:\/\/scp-jp\./, branch: "JP"},
  { pattern: /^http:\/\/scp-wiki-cn\./, branch: "CN"},
  { pattern: /^http:\/\/lafundacionscp\./, branch: "ES"},
  { pattern: /^http:\/\/scpko\./, branch: "KO"},
  { pattern: /^http:\/\/scp-pl\./, branch: "PL"},
  { pattern: /^http:\/\/scpfoundation\./, branch: "RU"},
  { pattern: /^http:\/\/scp-zh-tr\./, branch: "ZH"},
  { pattern: /^http:\/\/scp-pt-br\./, branch: "PT"},
  { pattern: /^http:\/\/scp-wiki-de\./, branch: "DE"},
  { pattern: /^http:\/\/scp-int\./, branch: "INT"},
  { pattern: /^http:\/\/fondationscp\./, branch: "FR"},
  { pattern: /^http:\/\/fondazionescp\./, branch: "IT"},
  { pattern: /^http:\/\/scp-th\./, branch: "TH"},
  { pattern: /^http:\/\/scp-cs\./, branch: "CS"},
  { pattern: /^http:\/\/scp-vn\./, branch: "VN"},
  { pattern: /^http:\/\/scp-ukrainian\./, branch: "UR"},
  { pattern: /^http:\/\/scp-idn\./, branch: "ID"},
  { pattern: /^http:\/\/scp-el\./, branch: "EL"},
  { pattern: /^http:\/\/scp-nd\./, branch: "ND"},
  { pattern: /^http:\/\/scpvakfi\./, branch: "TR"},
];

// クエリと変数を元にCrom APIのURLを構築する
const buildCromApiUrl = (query, variables) => {
  const encodedQuery = encodeURIComponent(query);
  const encodedVariables = encodeURIComponent(JSON.stringify(variables));
  return `https://api.example.com/graphql?query=${encodedQuery}&variables=${encodedVariables}`;
};

// GraphQL APIを非同期に実行し、エラー処理も含める
const executeQuery = async (author, afterID) => {
  const variables = { author, afterID };
  const url = buildCromApiUrl(GRAPHQL_QUERY, variables);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors && errors.length > 0) {
    throw new Error("GraphQL errors: " + JSON.stringify(errors));
  }

  return data;
};

// ノードから記事情報を再帰的に抽出する
const collectArticles = (node) => {
  if (!node) return [];

  const articles = [];

  const addArticle = (item) => {
    if (item && item.wikidotInfo) {
      articles.push({
        url: item.url,
        title: item.wikidotInfo.title,
        rating: item.wikidotInfo.rating,
        createdAt: new Date(item.wikidotInfo.createdAt),
        // attributonsのユーザー名をすべて小文字に変換して配列に保持
        names: item.attributions.map(attr => attr.user.name.toLowerCase()),
        branch: null,
      });
    }
  };

  addArticle(node);

  if (Array.isArray(node.translations)) {
    node.translations.forEach(addArticle);
  }
  if (node.translationOf) {
    addArticle(node.translationOf);
    if (Array.isArray(node.translationOf.translations)) {
      node.translationOf.translations.forEach(addArticle);
    }
  }

  return articles;
};

// ノードから記事情報を解析し、オリジナル版または日本語版の記事情報を返す
// targetAuthor は小文字に変換済みのWikidot ID
// checkJP が true の場合は日本語版を、false の場合はオリジナル版を抽出します
const parseArticleInfo = (node, targetAuthor = '', checkJP = false) => {
  const articles = collectArticles(node);
  if (!articles.length) return null;

  if (checkJP) {
    // URLに基づいて日本語版の記事を探す
    const jpArticle = articles.find(article => /http:\/\/scp-jp\./.test(article.url));
    const wlJpArticle = articles.find(article => /http:\/\/wanderers-library\./.test(article.url));
    if (jpArticle) {
      jpArticle.branch = "JP";
      return jpArticle;
    } else if (wlJpArticle) {
      wlJpArticle.branch = "WL-JP";
      return wlJpArticle;
    }
    return null;
  } else {
    // 対象の著者が含まれている記事に絞る
    const candidates = articles.filter(article => article.names.includes(targetAuthor));
    if (!candidates.length) return null;

    // 投稿日が最も早い記事を選択
    let oriArticle = candidates.reduce((earliest, article) =>
      article.createdAt < earliest.createdAt ? article : earliest
    );
    
    // URLパターンにより記事ブランチを設定する
    const matched = WIKI_REGEXES.find(({ pattern }) => pattern.test(oriArticle.url));
    if (matched) {
      oriArticle.branch = matched.branch;
      // オリジナル検索時に日本語ブランチの記事は除外する
      return matched.branch === "JP" ? null : oriArticle;
    }

    return null;
  }
};

// オリジナル版と日本語版の情報を取得するためのラッパー
const getOriginalInfo = (node, targetAuthor) => parseArticleInfo(node, targetAuthor, false);
const getJPInfo = (node) => parseArticleInfo(node, '', true);

// 日付を "YYYY/MM/DD" の形式にフォーマットする
const formatDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

// ページノードからHTML文字列を生成する
const buildPageHtml = (node, targetAuthor) => {
  const oriInfo = getOriginalInfo(node, targetAuthor);
  const jpInfo = getJPInfo(node);

  if (!oriInfo) return "";

  // 翻訳されていない場合
  if (!jpInfo) {
    return `
      <div class="untransPage">
        <p>
          <strong>${oriInfo.branch}:</strong>
          <a href="${oriInfo.url}" target="_blank">${oriInfo.title}</a>
          <span class="postDate"> ${formatDate(oriInfo.createdAt)}投稿</span>
        </p>
      </div>
    `;
  }

  // 翻訳されている場合
  return `
    <div class="page">
      <p>
        <a href="${jpInfo.url}" target="_blank">${jpInfo.title}</a>
      </p>
      <p class="details">
        <strong>原語版:</strong>
        <a href="${oriInfo.url}" target="_blank">${oriInfo.title}</a>
        <span class="postDate"> ${formatDate(jpInfo.createdAt)}翻訳 ${formatDate(oriInfo.createdAt)}投稿</span>
      </p>
      <p class="details">
        <strong>${oriInfo.branch}:</strong> ${oriInfo.rating} / <strong>${jpInfo.branch}:</strong> ${jpInfo.rating}
      </p>
    </div>
  `;
};

// 取得したページリストを整形・整列してレンダリングする
const renderPages = (pages, targetAuthor) => {
  const resultContainer = document.getElementById("result");

  if (!pages.length) {
    resultContainer.innerHTML = "<p>Wikidot IDが間違っています。</p>";
    return;
  }

  const processedUrls = new Set();
  const sortedPages = pages
    .map(page => {
      const oriInfo = getOriginalInfo(page.node, targetAuthor);
      return { ...page, oriInfo };
    })
    .filter(({ oriInfo }) => {
      if (!oriInfo || processedUrls.has(oriInfo.url)) return false;
      processedUrls.add(oriInfo.url);
      return true;
    })
    .sort((a, b) => b.oriInfo.createdAt - a.oriInfo.createdAt);

  const pagesHTML = sortedPages.map(({ node }) => buildPageHtml(node, targetAuthor)).join("");
  resultContainer.innerHTML = pagesHTML;
};

// 著者IDを元に記事検索を行い、ページネーションにも対応する
const searchArticle = async (author) => {
  let afterID = null;
  const allPages = [];
  const loadingElement = document.getElementById("loading");
  loadingElement.style.display = "block";

  // 入力された著者IDは小文字に正規化
  const normalizedAuthor = author.toLowerCase();

  try {
    do {
      const response = await executeQuery(author, afterID);
      const pages = response.user.attributedPages.edges;
      const hasNextPage = response.user.attributedPages.pageInfo.hasNextPage;

      allPages.push(...pages);
      afterID = hasNextPage ? response.user.attributedPages.pageInfo.endCursor : null;

      // リクエスト間隔を空けて連続リクエストを防ぐ
      if (afterID) await new Promise(resolve => setTimeout(resolve, 500));
    } while (afterID);

    renderPages(allPages, normalizedAuthor);
  } catch (error) {
    console.error("検索に失敗しました", error);
    document.getElementById("result").innerHTML =
      "<p>エラーが発生しました。再度お試しください。</p>";
  } finally {
    loadingElement.style.display = "none";
  }
};

// DOMコンテンツの読み込み完了後にイベントリスナーを設定する
document.addEventListener("DOMContentLoaded", () => {
  const authorInput = document.getElementById("authorInput");
  const searchButton = document.getElementById("searchButton");
  const resultContainer = document.getElementById("result");

  const initiateSearch = () => {
    const author = authorInput.value.trim();
    if (!author) {
      alert("Wikidot IDを入力してください");
      return;
    }
    resultContainer.innerHTML = "";
    searchArticle(author);
  };

  searchButton.addEventListener("click", initiateSearch);

  authorInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      initiateSearch();
    }
  });
});
