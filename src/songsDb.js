// Song database — shared with main karaoke app
// Format: ["Tên Bài", "Ca Sĩ"]
export const songsDb = [
    ["Duyên Phận", "Như Quỳnh"],
    ["Sầu Tím Thiệp Hồng", "Quang Lê - Lệ Quyên"],
    ["Vùng Lá Me Bay", "Như Quỳnh"],
    ["Chuyện Giàn Thiên Lý", "Mạnh Quỳnh"],
    ["Em Của Ngày Hôm Qua", "Sơn Tùng M-TP"],
    ["Lạc Trôi", "Sơn Tùng M-TP"],
    ["Nơi Này Có Anh", "Sơn Tùng M-TP"],
    ["Hồng Nhan", "Jack"],
    ["Bạc Phận", "Jack"],
    ["Sóng Gió", "Jack - K-ICM"],
    ["Ai Chung Tình Được Mãi", "Đinh Tùng Huy"],
    ["Thuyền Quyên", "Diệu Kiên"],
    ["Mời Anh Về Thăm Quê Em", "Thùy Trang"],
    ["Áo Mới Cà Mau", "Phi Nhung"],
    ["Trách Ai Vô Tình", "Phi Nhung"],
    ["Chim Trắng Mồ Côi", "Đan Trường - Cẩm Ly"],
    ["Cắt Đôi Nỗi Sầu", "Tăng Duy Tân"],
    ["Bên Trên Tầng Lầu", "Tăng Duy Tân"],
    ["See Tình", "Hoàng Thùy Linh"],
    ["Để Mị Nói Cho Mà Nghe", "Hoàng Thùy Linh"],
    ["Ngày Mai Người Ta Lấy Chồng", "Thành Đạt"],
    ["Hoa Nở Không Màu", "Hoài Lâm"],
    ["Buồn Làm Chi Em Ơi", "Hoài Lâm"],
    ["Gõ Cửa Trái Tim", "Quang Lê - Mai Thiên Vân"],
    ["Đắp Mộ Cuộc Tình", "Đan Nguyên"],
    ["Lại Nhớ Người Yêu", "Đan Nguyên"],
    ["Xuân Này Con Không Về", "Quang Lê"],
    ["Cánh Thiệp Đầu Xuân", "Như Quỳnh"],
    ["Câu Hẹn Câu Thề", "Đình Dũng"],
    ["Đế Vương", "Đình Dũng"],
    ["Phố Đêm", "Như Quỳnh"],
    ["Mưa Đêm Tỉnh Nhỏ", "Quang Lê"],
    ["Chuyến Tàu Hoàng Hôn", "Lệ Quyên"],
    ["Sương Trắng Miền Quê Ngoại", "Quang Lê"],
    ["Nhẫn Cỏ Cho Em", "Mạnh Quỳnh"],
    ["Tình Chỉ Đẹp Khi Còn Dang Dở", "Lệ Quyên"],
    ["Đồi Thông Hai Mộ", "Lệ Quyên"],
    ["Lâu Đài Tình Ái", "Đàm Vĩnh Hưng"],
    ["Biển Tình", "Đàm Vĩnh Hưng"],
    ["Xin Lỗi Tình Yêu", "Đàm Vĩnh Hưng"],
    ["Say Tình", "Đàm Vĩnh Hưng"],
    ["Nửa Vầng Trăng", "Đàm Vĩnh Hưng"],
    ["Chắc Ai Đó Sẽ Về", "Sơn Tùng M-TP"],
    ["Muộn Rồi Mà Sao Còn", "Sơn Tùng M-TP"],
    ["Chúng Ta Của Hiện Tại", "Sơn Tùng M-TP"],
    ["Hãy Trao Cho Anh", "Sơn Tùng M-TP"],
    ["Có Chắc Yêu Là Đây", "Sơn Tùng M-TP"],
    ["Em Gái Mưa", "Hương Tràm"],
    ["Ngốc", "Hương Tràm"],
    ["Duyên Mình Lỡ", "Hương Tràm"],
];

function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

// Build search index once
const searchIndex = songsDb.map(([title, artist]) => ({
    title,
    artist,
    searchStr: removeAccents(`${title} ${artist}`),
}));

export function searchSongs(query) {
    if (!query || query.length < 1) return [];

    const normalizedQuery = removeAccents(query.trim());
    const matches = [];

    for (const song of searchIndex) {
        if (song.searchStr.includes(normalizedQuery)) {
            matches.push({
                title: song.title,
                artist: song.artist,
            });
        }
        if (matches.length >= 15) break;
    }

    return matches;
}
