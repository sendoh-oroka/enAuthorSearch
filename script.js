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

const buildCromApiUrl = (query, variables) => `https://api.crom.avn.sh/graphql?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`
const getENinfo = (node) => extractInfo(node, /^http:\/\/scp-wiki\..*/, true);
const getJPinfo = (node) => extractInfo(node, /^http:\/\/scp-jp\..*/);

// GraphQL API呼び出し用の関数
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

// 日付フォーマット用の関数
function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
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

// HTMLを生成する関数
function buildPageHhml(node) {
  const enInfo = getENinfo(node);
  const jpInfo = getJPinfo(node);

  if(!enInfo) return "";

  if(!jpInfo) {
    return `
      <div class="untransPage">
        <p><strong>未訳:</strong> <a href="${enInfo.url}" target="_blank">${enInfo.title}</a><span class="postDate"> ${formatDate(enInfo.createdAt)}投稿</span></p>
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

  // 日付ソート
  const sortedPages = pages.slice().sort((a, b) => {
    const enInfoA = getENinfo(a.node);
    const enInfoB = getENinfo(b.node);
    if(!enInfoA && !enInfoB) return 0;
    if(!enInfoA) return 1;
    if(!enInfoB) return -1;
    return enInfoB.createdAt - enInfoA.createdAt;
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

    // レスポンス件数が上限の場合は更に検索可能する
    if (hasNextPage) {
      setTimeout(() => {
        searchArticle(afterID);
      }, 1000);
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

  // Enterキーでも検索をトリガー
  authorInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      searchButton.click();
    }
  });
});
