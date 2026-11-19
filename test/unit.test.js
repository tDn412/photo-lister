import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectCategory,
  detectCondition,
  filenameToName,
  formatShortVnd,
  formatVnd,
  isPersonalDocument,
  parsePrice,
} from '../src/parse.js';
import { suggestLocal } from '../src/suggest.js';
import { buildCaption, photoFileName } from '../src/post.js';

test('parsePrice understands common Vietnamese price formats', () => {
  const cases = [
    ['4.500.000', 4_500_000],
    ['4,500,000', 4_500_000],
    ['4 500 000', 4_500_000],
    ['450k', 450_000],
    ['450K', 450_000],
    ['1k5', 1_500],
    ['4.5tr', 4_500_000],
    ['4,5 triệu', 4_500_000],
    ['4tr5', 4_500_000],
    ['1tr250', 1_250_000],
    ['2 tỷ', 2_000_000_000],
    ['4.5', 4_500_000],
    ['450', 450_000],
    ['4.500.000 ₫', 4_500_000],
    ['12.900.000đ', 12_900_000],
  ];
  for (const [input, expected] of cases) {
    assert.equal(parsePrice(input), expected, input);
  }
});

test('parsePrice rejects nonsense and handles blanks', () => {
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('   '), null);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice('4tr5tr'), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(0), 0);
});

test('VND formatting is Vietnamese-market friendly', () => {
  assert.equal(formatVnd(4_500_000), '4.500.000 ₫');
  assert.equal(formatVnd('450k'), '450.000 ₫');
  assert.equal(formatShortVnd(4_500_000), '4,5 tr');
  assert.equal(formatShortVnd(450_000), '450k');
  assert.equal(formatShortVnd(2_000_000_000), '2 tỷ');
  assert.equal(formatShortVnd(0), '—');
});

test('filenameToName produces tidy marketplace titles', () => {
  const cases = [
    ['iphone-13-pro-max-256gb-fullbox.jpg', 'iPhone 13 Pro Max 256GB Fullbox'],
    ['IMG_1234_macbook-air-m2.jpg', 'MacBook Air M2'],
    ['nike-air-force-1-size-42.jpg', 'Nike Air Force 1 Size 42'],
    ['sony-a7iii-camera-body.jpg', 'Sony A7III Camera Body'],
    ['canon-ef-50mm-lens.jpg', 'Canon EF 50mm Lens'],
    ['uniqlo-ultralight-down-jacket.jpg', 'Uniqlo Ultralight Down Jacket'],
    ['airpods-pro-2.jpg', 'AirPods Pro 2'],
    ['marshall-bluetooth-speaker.jpg', 'Marshall Bluetooth Speaker'],
    ['zalo-1234567890.jpg', 'Untitled item'],
    ['496457_Nhữ Đình Tú.jpg', 'Nhữ Đình Tú'],
    ['2023-macbook-air-m2.jpg', '2023 MacBook Air M2'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(filenameToName(input), expected, input);
  }
});

test('detectCategory covers the usual marketplace categories', () => {
  assert.equal(detectCategory('iphone-13-pro-256gb.jpg'), 'phone');
  assert.equal(detectCategory('macbook-air-m2.jpg'), 'laptop');
  assert.equal(detectCategory('tai-nghe-airpods.jpg'), 'audio');
  assert.equal(detectCategory('xe-may-honda-vision.jpg'), 'motorbike');
  assert.equal(detectCategory('xe-dap-giant.jpg'), 'bike');
  assert.equal(detectCategory('tui-xach-da.jpg'), 'bag');
  assert.equal(detectCategory('giay-nike.jpg'), 'shoes');
  assert.equal(detectCategory('sach-tieng-anh.jpg'), 'book');
  assert.equal(detectCategory('ban-tra-giay.jpg'), 'furniture');
  assert.equal(detectCategory('something-random.jpg'), 'default');
});

test('personal documents are detected and never priced', () => {
  for (const filename of [
    'CCCD back.jpg',
    'CCCD front.jpg',
    'cmnd-mat-truoc.jpg',
    'can-cuoc-cong-dan.jpg',
    'passport.jpg',
    'ho-chieu.jpg',
    'bang-lai-xe.jpg',
    'giay-to-tuy-than.jpg',
  ]) {
    assert.equal(detectCategory(filename), 'document', filename);
    assert.equal(isPersonalDocument(filename), true, filename);
  }
  assert.equal(isPersonalDocument('passport-cover.jpg'), false, 'accessories are not documents');
  assert.equal(isPersonalDocument('iphone-13-pro.jpg'), false);

  const doc = suggestLocal({ filename: 'CCCD back.jpg', condition: 'used' });
  assert.equal(doc.category, 'document');
  assert.equal(doc.name, 'CCCD Back');
  assert.equal(doc.price, null);
  assert.equal(doc.range, null);
  assert.match(doc.note, /Personal document/);
});

test('detectCondition reads common filename hints', () => {
  assert.equal(detectCondition('iphone-fullbox.jpg'), 'new');
  assert.equal(detectCondition('iphone-like-new.jpg'), 'like-new');
  assert.equal(detectCondition('iphone-da-dung.jpg'), 'used');
  assert.equal(detectCondition('iphone-loi-nguon.jpg'), 'for-parts');
});

test('local suggestion gives a deterministic, plausible iPhone price', () => {
  const item = { filename: 'iphone-13-pro-256gb.jpg', condition: 'used' };
  const first = suggestLocal(item);
  const second = suggestLocal(item);
  assert.equal(first.name, 'iPhone 13 Pro 256GB');
  assert.equal(first.category, 'phone');
  assert.equal(first.source, 'local');
  assert.equal(first.price, second.price, 'same filename should give same price');
  assert.ok(first.price >= 4_000_000 && first.price <= 15_000_000, `price out of range: ${first.price}`);
  assert.ok(first.range.min <= first.price && first.price <= first.range.max, 'price should sit inside range');
  assert.match(first.note, /iPhone/i);
});

test('condition changes the local estimate in the right direction', () => {
  const used = suggestLocal({ filename: 'iphone-13-pro-256gb.jpg', condition: 'used' });
  const likeNew = suggestLocal({ filename: 'iphone-13-pro-256gb.jpg', condition: 'like-new' });
  const newItem = suggestLocal({ filename: 'iphone-13-pro-256gb.jpg', condition: 'new' });
  assert.ok(used.price < likeNew.price, 'used should be cheaper than like new');
  assert.ok(likeNew.price < newItem.price, 'new should be the most expensive');
});

test('local suggestion works for non-phone categories', () => {
  const shoes = suggestLocal({ filename: 'nike-air-force-1-size-42.jpg', condition: 'used' });
  assert.equal(shoes.category, 'shoes');
  assert.ok(shoes.price >= 50_000 && shoes.price <= 3_500_000, `shoe price out of range: ${shoes.price}`);
  assert.equal(shoes.name, 'Nike Air Force 1 Size 42');

  const unknown = suggestLocal({ filename: 'IMG_9231.jpg', condition: 'used' });
  assert.equal(unknown.category, 'default');
  assert.equal(unknown.name, 'Product');
  assert.ok(unknown.price > 0);
});

test('post captions are plain text ready for a marketplace composer', () => {
  const caption = buildCaption({
    name: '  iPhone 13 Pro 256GB ',
    price: 8_500_000,
    condition: 'like-new',
    notes: ' Full box.\nPin 92%. ',
  });
  assert.equal(
    caption,
    'iPhone 13 Pro 256GB\n8.500.000 ₫ · Like new (Như mới)\n\nFull box.\nPin 92%.'
  );

  const bare = buildCaption({ name: 'Canon EF 50mm', price: 0, condition: 'used' });
  assert.equal(bare, 'Canon EF 50mm\nUsed (Đã dùng)');

  assert.equal(buildCaption({}), 'Product\nUsed (Đã dùng)');

  const documentCaption = buildCaption({
    name: 'CCCD Back',
    price: 660_000,
    condition: 'used',
    isDocument: true,
  });
  assert.equal(documentCaption, 'CCCD Back');
});

test('photo download names are readable and safe', () => {
  assert.equal(photoFileName('iPhone 13 Pro 256GB'), 'iphone-13-pro-256gb.jpg');
  assert.equal(photoFileName('Đồng hồ cũ / 40mm'), 'dong-ho-cu-40mm.jpg');
  assert.equal(photoFileName(''), 'photo.jpg');
  assert.equal(photoFileName('!!!'), 'photo.jpg');
});
