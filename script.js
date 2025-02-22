// 検索クエリ
const query =`
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
            wikidotInfo {
              title
              rating
              createdAt
            }
            translations {
              url
              wikidotInfo {
                title
                rating
                createdAt
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

let targetAuthor = "";
let allPages = [];

// GraphQL API呼び出し用の関数
const buildCromApiUrl = (query, variables) =>
  `https://api.crom.avn.sh/graphql?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

async function executeQuery(afterID) {
  const author = targetAuthor;
  const variables = { author, afterID }
  const requestUrl = buildCromApiUrl(query, variables);

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  const { data, errors } = await response.json();
  if (errors && errors.length > 0) {
    throw new Error("GraphQL errors: " + JSON.stringify(errors));
  }

  return data;
}

// 共通の情報抽出関数
function extractInfo(node, pattern, checkMainUrl = false) {
  const selectInfo = (obj) => ({
    url: obj.url,
    title: obj.wikidotInfo.title,
    rating: obj.wikidotInfo.rating,
    createdAt: new Date(obj.wikidotInfo.createdAt)
  });

  if (checkMainUrl && pattern.test(node.url)) {
    return selectInfo(node);
  }

  if (Array.isArray(node.translations)) {
    const match = node.translations.find((t) => pattern.test(t.url));
    if (match) return selectInfo(match);
  }
  return null;
}

const getENinfo = (node) => extractInfo(node, /^http:\/\/scp-wiki\..*/, true);
const getJPinfo = (node) => extractInfo(node, /^http:\/\/scp-jp\..*/);

// HTMLを生成する関数
const formatDate = (date) =>
  `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

function buildPageHhml(node) {
  const enInfo = getENinfo(node);
  const jpInfo = getJPinfo(node);

  if(!jpInfo) {
    return `
      <div class="untransPage">
        <p><strong></strong><a href="${enInfo.url}" target="_blank">${enInfo.title}</a><span class="postDate"> ${formatDate(enInfo.createdAt)}投稿</span></p>
      </div>
    `;
  }

  return `
    <div class="page">
      <p><a href="${jpInfo.url}" target="_blank">${jpInfo.title}</a></p>
      <p class="details">
        <strong>原語版:</strong> 
        <a href="${enInfo.url}" target="_blank">${enInfo.title}</a><span class="postDate"> ${formatDate(jpInfo.createdAt)}翻訳 ${formatDate(enInfo.createdAt)}投稿</span>
      </p>
      <p class="details">
        <strong>EN:</strong> ${enInfo.rating} / <strong>JP:</strong> ${jpInfo.rating}
      </p>
    </div>
  `;
}

// レスポンスからページ情報をレンタリングする関数
function renderPages(pages) {
  const resultContainer = document.getElementById("result");
  
  // 初回検索時に検索結果が0件の場合
  if (!pages.length) {
    resultContainer.innerHTML = "<p>Wikidot IDが間違っています。</p>";
    return;
  }

  // 日付ソート・重複削除
  const processedUrls = new Set();
  const sortedPages = pages
    .map(page => {
      const enInfo = getENinfo(page.node);
      return { ...page, enInfo};
    })
    .filter(({ enInfo }) => {
      if (!enInfo || processedUrls.has(enInfo.url)) return false;
      processedUrls.add(enInfo.url);
      return true;
    })
    .sort((a, b) => {
      return b.enInfo.createdAt - a.enInfo.createdAt;
    });
  
  const pagesHTML = sortedPages.map(({ node }) => buildPageHhml(node)).join("");
  resultContainer.innerHTML = pagesHTML;
}

// ローディングアニメーションを管理する関数
function showLoading(show) {
  const loadingElement = document.getElementById("loading");
  loadingElement.style.display = show ? "block" : "none";
}

// 検索結果の取得とレンダリングを行う関数
async function searchArticle(afterID = null) {
  try {
    const response = await executeQuery(afterID);
    const pages = response.user.attributedPages.edges;
    const hasNextPage = response.user.attributedPages.pageInfo.hasNextPage;
    afterID = response.user.attributedPages.pageInfo.endCursor;
    allPages = [...allPages, ...pages];

    // まだ記事がある場合は更に検索する
    if (hasNextPage) {
      setTimeout(() => {
        searchArticle(afterID);
      }, 500);
    } else {
      renderPages(allPages);
      showLoading(false);
    }
  } catch (error) {
    console.error("検索に失敗しました", error);
    document.getElementById("result").innerHTML = "<p>エラーが発生しました。再度お試しください。</p>";
    showLoading(false);
  } 
}

// DOM読み込み後の初期設定
document.addEventListener("DOMContentLoaded", () => {
  const authorInput = document.getElementById("authorInput");
  const searchButton = document.getElementById("searchButton");
  const resultContainer = document.getElementById("result");

  // 初回検索時のイベント設定
  searchButton.addEventListener("click", () => {
    const author = authorInput.value.trim();
    if (!author) {
      alert("Wikidot IDを入力してください");
      return;
    }

    resultContainer.innerHTML = "";
    targetAuthor = author;
    allPages = [];
    showLoading(true);
    searchArticle();
  });

  authorInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      searchButton.click();
    }
  });
});
