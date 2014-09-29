(function($) {

  'use strict';

  var KML_URL = 'http://limouren.appspot.com/map.kml';

  var BLACKLIST_EXTENDED_DATA_NAMES = [
    '\u72C0\u6CC1', // 狀況
    'Category',
    'Longitude',
    'Latitude'
  ];

  var FOLDER_DICT;

  var FolderSelectContainer,
      FolderSelect,
      FolderContainer;

  function fetchKML() {
    return $.get(KML_URL);
  }

  function parseKML(data) {
    return $(data);
  }

  function createFolderDict(folders) {
    var d = {};
    folders.each(function() {
      var folder = $(this),
          name = folder.find('>name').text();
      d[name] = folder;
    })

    return d;
  }

  function renderExtendedDataItem(data) {
    var name = data.attr('name'),
        value = data.find('>value').text();

    if (!name || !value || $.inArray(name, BLACKLIST_EXTENDED_DATA_NAMES) !== -1) {
      return $();
    }

    var $el = $('<li><span class="value-span"></span></li>'),
        nameSpan = $el.find('.data-name'),
        valueSpan = $el.find('.value-span');

    valueSpan.html(value);

    return $el;
  }

  function renderPlacemark(placemark) {
    var nameText = placemark.find('>name').text(),
        datas = placemark.find('ExtendedData>Data');

    var $el = $(
      '<li><span class="name"></span>' +
        '<ul class="placemark">' +
        '</ul>' +
      '</li>'),
      placemarkList = $el.find('.placemark'),
      nameSpan = $el.find('.name');

    nameSpan.html(nameText);

    datas.each(function() {
      var data = $(this),
          dataEl = renderExtendedDataItem(data);
      placemarkList.append(dataEl);
    });

    return $el;
  }

  function renderFolder(folder) {
    var nameText = folder.find('>name').text(),
        placemarks = folder.find('>Placemark');

    var $el = $('<h2 class="folder-name"></h2><ul class="placemark-list"></ul>'),
        nameEl = $el.filter('.folder-name'),
        placemarkList = $el.filter('.placemark-list');

    nameEl.html(nameText);

    placemarks.each(function() {
      var placemark = $(this),
          $itemEl = renderPlacemark(placemark);
      placemarkList.append($itemEl);
    });

    return $el;
  }

  function handleFolderSelectChanged() {
    var folderName = FolderSelect.val(),
        folder = FOLDER_DICT[folderName];

    if (folder) {
      var folderEl = renderFolder(folder);
      FolderContainer.empty();
      FolderContainer.append(folderEl);
    }
  }

  function renderFolderSelect() {
    var keys = [];
    for (var key in FOLDER_DICT) {
      keys.push(key);
    }

    var $el = $('<select id="folder-select" />');
    $.each(keys, function(i, key) {
      var keyEl = $('<option/>');
      keyEl.html(key);
      $el.append(keyEl);
    });

    return $el;
  }

  function renderDocument(doc) {
    var folders = doc.find('Document>Folder');

    FOLDER_DICT = createFolderDict(folders);

    FolderSelect = renderFolderSelect();
    FolderSelect.on('change', handleFolderSelectChanged);
    FolderSelectContainer.append(FolderSelect);

    var selectedFolderName = FolderSelect.val(),
        folder = FOLDER_DICT[selectedFolderName];

    if (folder) {
      var folderEl = renderFolder(folder);
      FolderContainer.append(folderEl);
    }
  }

  function init() {
    FolderSelectContainer = $('#folder-select-container');
    FolderContainer = $('#content>.folder');

    fetchKML().then(function(data) {
      var doc = parseKML(data);
      renderDocument(doc);

      $(document.body).removeClass('loading');
    });
  }

  $(document).ready(init);

})(jQuery);