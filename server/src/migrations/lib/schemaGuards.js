'use strict';

const tableNameOf = (entry) => {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry.tableName || entry.TABLE_NAME || '';
  return '';
};

const tableExists = async (queryInterface, tableName) => {
  const allTables = await queryInterface.showAllTables();
  return allTables.map(tableNameOf).includes(tableName);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  if (!(await tableExists(queryInterface, tableName))) return false;
  const description = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(description, columnName);
};

const indexExists = async (queryInterface, tableName, indexName) => {
  if (!(await tableExists(queryInterface, tableName))) return false;
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((idx) => idx.name === indexName);
};

module.exports = {
  tableExists,
  columnExists,
  indexExists,
};
